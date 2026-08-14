package httpapi

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/google/uuid"

	"github.com/arkive-games/arkive/backend-go/internal/core/auth"
	"github.com/arkive-games/arkive/backend-go/internal/core/forum"
	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

// ReportBody is a complaint about a post or a comment.
type ReportBody struct {
	// Exactly one of these. A body naming both, or neither, is refused rather than
	// guessed at.
	PostNo    *int64     `json:"postNo,omitempty" minimum:"1" doc:"The post being reported"`
	CommentID *uuid.UUID `json:"commentId,omitempty" doc:"The comment being reported"`

	Reason string  `json:"reason" enum:"spam,abuse,offtopic,illegal,other" doc:"Why you are reporting it"`
	Detail *string `json:"detail,omitempty" maxLength:"2000" doc:"Anything you want to add"`
}

// HideBody carries the moderator's reason. It is optional, and stored rather than
// shown: it is a note for the next moderator, not a message to the author.
type HideBody struct {
	Reason *string `json:"reason,omitempty" maxLength:"500" doc:"Why it is being hidden"`
}

// ResolveReportBody answers a report.
type ResolveReportBody struct {
	State string `json:"state" enum:"upheld,rejected" doc:"The decision"`
}

type reportInput struct {
	Body ReportBody
}

// Body is a pointer, which is how huma marks it optional. The reason is optional, so
// requiring an object just to omit its only field would be a 400 for doing nothing
// wrong.
type hidePostInput struct {
	PostNo int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
	Body   *HideBody
}

type unhidePostInput struct {
	PostNo int64 `path:"postNo" minimum:"1" doc:"Permanent post number"`
}

type hideCommentInput struct {
	ID   uuid.UUID `path:"id" doc:"Comment identifier"`
	Body *HideBody
}

type unhideCommentInput struct {
	ID uuid.UUID `path:"id" doc:"Comment identifier"`
}

type resolveReportInput struct {
	ID   uuid.UUID `path:"id" doc:"Report identifier"`
	Body ResolveReportBody
}

type moderationQueueInput struct {
	Page     int `query:"page" default:"1" minimum:"1" doc:"1-based page number"`
	PageSize int `query:"pageSize" default:"20" minimum:"1" maximum:"100" doc:"Rows per page"`
}

// hideReason reads the optional reason out of an optional body.
func hideReason(body *HideBody) *string {
	if body == nil {
		return nil
	}
	return body.Reason
}

// RegisterModerationRoutes mounts the reporting and moderation surface.
func (h *Handlers) RegisterModerationRoutes(a huma.API) {
	huma.Register(a, huma.Operation{
		OperationID: "reportForumContent",
		Method:      http.MethodPost,
		Path:        "/forum/reports",
		Summary:     "Report a post or a comment",
		Description: "Any signed-in account may report. Reporting the same thing twice " +
			"updates your report rather than filing a second, and reopens it if it had " +
			"already been answered.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *reportInput) (*api.Response[forum.ReportRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		report, err := h.forum.Report(ctx, principal, in.Body.PostNo, in.Body.CommentID, in.Body.Reason, in.Body.Detail)
		if err != nil {
			return nil, err
		}
		return api.OK(report), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "hideForumPost",
		Method:      http.MethodPut,
		Path:        "/forum/posts/{postNo}/hidden",
		Summary:     "Hide a post",
		Description: "Moderator action, reversible and attributed. Requires moderating a " +
			"game the post is tagged with; a post tagged with no game is site " +
			"administrators only. A hidden post answers 404 to every reader, its author " +
			"included.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *hidePostInput) (*api.Response[struct{}], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.SetPostHidden(ctx, principal, in.PostNo, true, hideReason(in.Body)); err != nil {
			return nil, err
		}
		return api.OK(struct{}{}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "restoreForumPost",
		Method:      http.MethodDelete,
		Path:        "/forum/posts/{postNo}/hidden",
		Summary:     "Restore a hidden post",
		Description: "The same permissions as hiding.",
		Tags:        []string{"moderation"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *unhidePostInput) (*api.Response[struct{}], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.SetPostHidden(ctx, principal, in.PostNo, false, nil); err != nil {
			return nil, err
		}
		return api.OK(struct{}{}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "hideForumComment",
		Method:      http.MethodPut,
		Path:        "/forum/comments/{id}/hidden",
		Summary:     "Hide a comment",
		Description: "Scoped by the games of the post the comment belongs to, since a " +
			"comment carries no tags of its own.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *hideCommentInput) (*api.Response[struct{}], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.SetCommentHidden(ctx, principal, in.ID, true, hideReason(in.Body)); err != nil {
			return nil, err
		}
		return api.OK(struct{}{}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "restoreForumComment",
		Method:      http.MethodDelete,
		Path:        "/forum/comments/{id}/hidden",
		Summary:     "Restore a hidden comment",
		Description: "The same permissions as hiding.",
		Tags:        []string{"moderation"},
		Errors:      []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound},
	}, func(ctx context.Context, in *unhideCommentInput) (*api.Response[struct{}], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		if err := h.forum.SetCommentHidden(ctx, principal, in.ID, false, nil); err != nil {
			return nil, err
		}
		return api.OK(struct{}{}), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "resolveForumReport",
		Method:      http.MethodPost,
		Path:        "/forum/reports/{id}/resolution",
		Summary:     "Answer a report",
		Description: "Upholding a report does not hide anything by itself: hiding is a " +
			"separate, separately recorded decision. Answering an already-answered " +
			"report is refused.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound, http.StatusUnprocessableEntity},
	}, func(ctx context.Context, in *resolveReportInput) (*api.Response[forum.ReportRead], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		report, err := h.forum.ResolveReport(ctx, principal, in.ID, in.Body.State)
		if err != nil {
			return nil, err
		}
		return api.OK(report), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listOpenForumReports",
		Method:      http.MethodGet,
		Path:        "/forum/moderation/reports",
		Summary:     "The moderation queue",
		Description: "Open reports, oldest first, scoped to the games you moderate. A " +
			"site administrator sees everything. The reporter is not included: a " +
			"moderator judges the content, not who complained.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden},
	}, func(ctx context.Context, in *moderationQueueInput) (*api.Response[api.List[forum.ReportRead]], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		list, total, err := h.forum.OpenReports(ctx, principal, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})

	huma.Register(a, huma.Operation{
		OperationID: "listHiddenForumPosts",
		Method:      http.MethodGet,
		Path:        "/forum/moderation/hidden",
		Summary:     "Hidden posts",
		Description: "What a moderator can see and a reader cannot, scoped to the games " +
			"you moderate. This is the only way to find hidden content, which is why " +
			"hiding is reversible.",
		Tags:   []string{"moderation"},
		Errors: []int{http.StatusUnauthorized, http.StatusForbidden},
	}, func(ctx context.Context, in *moderationQueueInput) (*api.Response[api.List[forum.HiddenRead]], error) {
		principal, err := auth.RequireUser(ctx)
		if err != nil {
			return nil, err
		}
		list, total, err := h.forum.HiddenPosts(ctx, principal, in.Page, in.PageSize)
		if err != nil {
			return nil, err
		}
		return api.OKList(list, total), nil
	})
}
