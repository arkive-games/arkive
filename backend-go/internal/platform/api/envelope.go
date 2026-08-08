// Package api defines the response envelope every endpoint returns and the
// glue that makes huma's own errors use it.
package api

import (
	"github.com/danielgtaylor/huma/v2"

	"github.com/arkive-games/arkive/backend-go/internal/platform/apierr"
)

// Envelope wraps every successful payload. The shape is carried over from the
// Python service, but is now applied consistently: fastapi-users' generated
// routes returned bare objects while hand-written routes returned an envelope,
// so a client had to know which was which.
type Envelope[T any] struct {
	ErrorCode    apierr.Code     `json:"errorCode" doc:"Always \"Success\" on a 2xx response" example:"Success"`
	ErrorMessage string          `json:"errorMessage" doc:"Always empty on a 2xx response"`
	ShowType     apierr.ShowType `json:"showType" doc:"How the client should surface this result"`
	Data         *T              `json:"data" doc:"The payload"`
}

// List is the payload shape for paginated collections.
type List[T any] struct {
	Count   int64 `json:"count" doc:"Total number of matching records, ignoring pagination"`
	Results []T   `json:"results" doc:"The current page of records"`
}

// Empty is the payload for endpoints that return no data.
type Empty struct{}

// Response is the huma output wrapper for an enveloped payload.
type Response[T any] struct {
	Body Envelope[T]
}

// OK builds a successful response around a payload.
func OK[T any](data T) *Response[T] {
	return &Response[T]{Body: Envelope[T]{
		ErrorCode: apierr.Success,
		ShowType:  apierr.ShowSilent,
		Data:      &data,
	}}
}

// OKList builds a successful response around a page of records.
func OKList[T any](results []T, count int64) *Response[List[T]] {
	if results == nil {
		results = []T{}
	}
	return OK(List[T]{Count: count, Results: results})
}

// OKEmpty builds a successful response with no payload.
func OKEmpty() *Response[Empty] {
	return OK(Empty{})
}

// InstallErrorModel routes every error huma raises internally — request
// validation, content negotiation, unhandled panics — through the project's
// error vocabulary, so clients never see two different error shapes.
//
// huma calls the NewError hook both at request time and once at registration
// time to derive the error schema for the OpenAPI document, so overriding it
// keeps the docs accurate too.
func InstallErrorModel() {
	huma.NewError = func(status int, msg string, errs ...error) huma.StatusError {
		// A handler that returned an *apierr.Error keeps its own code; huma
		// only reaches here for errors it raised itself.
		for _, err := range errs {
			if e, ok := apierr.As(err); ok {
				return e
			}
		}
		return apierr.New(apierr.CodeForStatus(status), msg).WithStatus(status)
	}
}
