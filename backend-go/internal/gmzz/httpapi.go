package gmzz

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/gmzz/characters"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
	"github.com/arkive-games/arkive/backend-go/internal/platform/ratelimit"
)

// writeRule bounds one account's character writes. Autosave sends at most one
// request per character every ten seconds, so this leaves an order of magnitude
// of headroom for a player editing in two tabs while still stopping a script.
var writeRule = ratelimit.Rule{Limit: 120, Window: time.Minute}

type handlers struct {
	characters *characters.Service
	limits     ratelimit.Limiter
}

// CreateCharacterBody is a new character.
type CreateCharacterBody struct {
	Name       string                 `json:"name" minLength:"1" maxLength:"64" doc:"1 to 32 characters after trimming"`
	ServerID   *int32                 `json:"serverId,omitempty" minimum:"0" doc:"A player server's id from the game's server list"`
	UID        *string                `json:"uid,omitempty" maxLength:"64"`
	ShowUID    bool                   `json:"showUid,omitempty"`
	Visibility *characters.Visibility `json:"visibility,omitempty" enum:"private,link" doc:"Defaults to link"`
	Data       map[string]any         `json:"data" doc:"The score page's inputs; must carry an integer schemaVersion"`
}

// UpdateCharacterBody is a partial change. An absent field is left alone; an
// serverId of 0 or an empty uid clears it.
type UpdateCharacterBody struct {
	Revision   int64                  `json:"revision" doc:"The revision last read; a stale one is refused with 409"`
	Name       *string                `json:"name,omitempty" maxLength:"64"`
	ServerID   *int32                 `json:"serverId,omitempty" minimum:"0" doc:"0 clears it"`
	UID        *string                `json:"uid,omitempty" maxLength:"64"`
	ShowUID    *bool                  `json:"showUid,omitempty"`
	Visibility *characters.Visibility `json:"visibility,omitempty" enum:"private,link"`
	Data       map[string]any         `json:"data,omitempty"`
}

// CopyCharacterBody names the copy; absent keeps the original's name.
type CopyCharacterBody struct {
	Name *string `json:"name,omitempty" maxLength:"64"`
}

// OrderBody is the owner's full list of character ids, in the order wanted.
type OrderBody struct {
	IDs []string `json:"ids" maxItems:"10"`
}

type listInput struct{}

type createInput struct {
	Body CreateCharacterBody
}

type idInput struct {
	ID string `path:"id" doc:"The character's public id"`
}

type updateInput struct {
	ID   string `path:"id"`
	Body UpdateCharacterBody
}

type copyInput struct {
	ID   string `path:"id"`
	Body *CopyCharacterBody
}

type orderInput struct {
	Body OrderBody
}

// writer returns the caller, throttled per account.
func (h *handlers) writer(ctx context.Context) (auth.Principal, error) {
	principal, err := auth.RequireUser(ctx)
	if err != nil {
		return principal, err
	}
	if !h.limits.Allow(ctx, ratelimit.Key("gmzz-characters", "user", principal.ID.String()), writeRule).Allowed {
		return principal, apierr.New(apierr.RateLimitExceeded, "too many character changes; please wait a minute")
	}
	return principal, nil
}

func (h *handlers) register(a huma.API) {
	tags := []string{"characters"}

	huma.Register(a, huma.Operation{
		OperationID: "listOwnCharacters",
		Method:      http.MethodGet,
		Path:        "/characters",
		Summary:     "List your characters",
		Description: "Metadata only, in your chosen order. Read one character for its data.",
		Tags:        tags,
		Errors:      []int{http.StatusUnauthorized},
	}, func(ctx context.Context, _ *listInput) (*api.Response[[]characters.Summary], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		list, err := h.characters.List(ctx, principal.ID)
		if err != nil {
			return nil, err
		}
		return api.OK(list), nil
	})

	huma.Register(a, huma.Operation{
		OperationID:   "createCharacter",
		Method:        http.MethodPost,
		Path:          "/characters",
		Summary:       "Save a new character",
		Description:   "Appended to the end of your list. An account holds at most ten.",
		Tags:          tags,
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusUnauthorized, http.StatusConflict, http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity, http.StatusTooManyRequests},
	}, func(ctx context.Context, in *createInput) (*api.Response[characters.Character], error) {
		principal, err := h.writer(ctx)
		if err != nil {
			return nil, err
		}
		c, err := h.characters.Create(ctx, principal.ID, characters.Input{
			Name: in.Body.Name, ServerID: in.Body.ServerID, UID: in.Body.UID, ShowUID: in.Body.ShowUID,
			Visibility: in.Body.Visibility, Data: in.Body.Data,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(c), nil
	})

	// Registered before /characters/{id} so the literal segment is never read as
	// an id; chi prefers static segments anyway, but the order states the intent.
	huma.Register(a, huma.Operation{
		OperationID: "orderCharacters",
		Method:      http.MethodPut,
		Path:        "/characters/order",
		Summary:     "Reorder your characters",
		Description: "`ids` must list each of your characters exactly once.",
		Tags:        tags,
		Errors:      []int{http.StatusUnauthorized, http.StatusUnprocessableEntity, http.StatusTooManyRequests},
	}, func(ctx context.Context, in *orderInput) (*api.Response[api.Empty], error) {
		principal, err := h.writer(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.characters.Reorder(ctx, principal.ID, in.Body.IDs); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "getCharacter",
		Method:      http.MethodGet,
		Path:        "/characters/{id}",
		Summary:     "Read a character",
		Description: "Open to anyone holding the link unless the character is private. `editable` " +
			"tells the owner apart. A private character is not found for everyone else, and the " +
			"uid is withheld from them unless its owner chose to show it.",
		Tags:   tags,
		Errors: []int{http.StatusNotFound},
	}, func(ctx context.Context, in *idInput) (*api.Response[characters.Character], error) {
		var viewer *auth.Principal
		if p, ok := auth.PrincipalFrom(ctx); ok && p.IsActive {
			viewer = &p
		}
		var c characters.Character
		var err error
		if viewer == nil {
			c, err = h.characters.Get(ctx, nil, in.ID)
		} else {
			c, err = h.characters.Get(ctx, &viewer.ID, in.ID)
		}
		if err != nil {
			return nil, err
		}
		return api.OK(c), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "updateCharacter",
		Method:      http.MethodPatch,
		Path:        "/characters/{id}",
		Summary:     "Change one of your characters",
		Description: "Partial. `revision` must be the one last read; a newer write on another " +
			"device makes this one fail with 409 rather than overwrite it.",
		Tags:   tags,
		Errors: []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusConflict, http.StatusRequestEntityTooLarge, http.StatusUnprocessableEntity, http.StatusTooManyRequests},
	}, func(ctx context.Context, in *updateInput) (*api.Response[characters.Character], error) {
		principal, err := h.writer(ctx)
		if err != nil {
			return nil, err
		}
		c, err := h.characters.Update(ctx, principal.ID, in.ID, characters.Patch{
			Revision: in.Body.Revision, Name: in.Body.Name, ServerID: in.Body.ServerID, UID: in.Body.UID,
			ShowUID: in.Body.ShowUID, Visibility: in.Body.Visibility, Data: in.Body.Data,
		})
		if err != nil {
			return nil, err
		}
		return api.OK(c), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "deleteCharacter",
		Method:      http.MethodDelete,
		Path:        "/characters/{id}",
		Summary:     "Delete one of your characters",
		Tags:        tags,
		Errors:      []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusTooManyRequests},
	}, func(ctx context.Context, in *idInput) (*api.Response[api.Empty], error) {
		principal, err := h.writer(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.characters.Delete(ctx, principal.ID, in.ID); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "copyCharacter",
		Method:      http.MethodPost,
		Path:        "/characters/{id}/copy",
		Summary:     "Copy a character into your list",
		Description: "Your own, or anyone's you can read. A copy of someone else's keeps the " +
			"inputs and server but not their uid. Counts toward the limit of ten.",
		Tags:          tags,
		DefaultStatus: http.StatusCreated,
		Errors:        []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity, http.StatusTooManyRequests},
	}, func(ctx context.Context, in *copyInput) (*api.Response[characters.Character], error) {
		principal, err := h.writer(ctx)
		if err != nil {
			return nil, err
		}
		var name *string
		if in.Body != nil {
			name = in.Body.Name
		}
		c, err := h.characters.Copy(ctx, principal.ID, in.ID, name)
		if err != nil {
			return nil, err
		}
		return api.OK(c), nil
	})
}
