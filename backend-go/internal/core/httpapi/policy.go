package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/policy"
	"github.com/arkive-games/arkive/backend-go/internal/core/roles"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

type moderationUnitsInput struct {
	ContentType string `query:"type" default:"" enum:",map,forum,profile,build"`
	Game        string `query:"game" default:""`
	State       string `query:"state" default:"pending" enum:"pending,published,rejected,hidden,withdrawn,deleted"`
	Page        int    `query:"page" default:"1" minimum:"1"`
	PageSize    int    `query:"pageSize" default:"20" minimum:"1" maximum:"100"`
}

type moderationDecisionInput struct {
	ID   uuid.UUID `path:"id"`
	Body struct {
		ExpectedRevision    int64  `json:"expectedRevision" minimum:"1"`
		Decision            string `json:"decision" enum:"approve,reject"`
		Classification      string `json:"classification" enum:"quality,ordinary,serious"`
		QualificationCredit bool   `json:"qualificationCredit"`
		Reason              string `json:"reason" minLength:"1" maxLength:"4000"`
		Evidence            string `json:"evidence" maxLength:"10000"`
	}
}

// RegisterPolicyRoutes exposes the server-owned publication contract. The current
// release uses the existing role scope for queue filtering and keeps decisions
// server-authorized through the same role service.
func (h *Handlers) RegisterPolicyRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "listModerationUnits", Method: http.MethodGet, Path: "/moderation/units",
		Summary: "List complete content submissions awaiting moderation", Tags: []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden},
	}, func(ctx context.Context, in *moderationUnitsInput) (*api.Response[api.List[policy.Unit]], error) {
		p, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		games, err := h.roles.GamesFor(ctx, p, roles.HideContent)
		if err != nil {
			return nil, err
		}
		if !p.IsSuperuser && len(games) == 0 {
			return nil, apierr.New(apierr.Forbidden, "you do not moderate any game")
		}
		if p.IsSuperuser {
			games = nil
		}
		result, err := h.policy.ListUnits(ctx, policy.ListFilter{ContentType: in.ContentType, Game: in.Game, State: in.State, Page: in.Page, PageSize: in.PageSize}, games)
		if err != nil {
			return nil, err
		}
		return api.OKList(result.Units, result.Count), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "decideModerationUnit", Method: http.MethodPost, Path: "/moderation/units/{id}/decision",
		Summary: "Approve or reject a complete content submission", Tags: []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusConflict, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *moderationDecisionInput) (*api.Response[api.Empty], error) {
		p, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if !p.IsSuperuser {
			games, scopeErr := h.roles.GamesFor(ctx, p, roles.HideContent)
			if scopeErr != nil {
				return nil, scopeErr
			}
			if len(games) == 0 {
				return nil, apierr.New(apierr.Forbidden, "you do not moderate any game")
			}
			allowed, scopeErr := h.policy.CanReviewUnit(ctx, in.ID, games)
			if scopeErr != nil {
				return nil, scopeErr
			}
			if !allowed {
				return nil, apierr.New(apierr.Forbidden, "you do not moderate this game's content")
			}
		}
		if err := h.policy.DecideUnit(ctx, p, in.ID, in.Body.ExpectedRevision, in.Body.Decision, in.Body.Classification, in.Body.Reason, in.Body.Evidence, in.Body.QualificationCredit); err != nil {
			return nil, err
		}
		return api.OKEmpty(), nil
	})
}
