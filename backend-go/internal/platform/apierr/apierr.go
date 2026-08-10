// Package apierr defines the stable error vocabulary shared by every module.
//
// Codes are strings rather than numbers so a client can switch on them without
// a lookup table, and so adding one is never a renumbering. They are ported
// from the Python service's ErrorCode enum; the aion2 domain codes live in the
// aion2 module rather than here.
package apierr

import (
	"errors"
	"fmt"
	"net/http"
)

// Code identifies an error condition. It is part of the public API contract.
type Code string

// General codes.
const (
	Success             Code = "Success"
	Unknown             Code = "Error"
	Unauthorized        Code = "UnauthorizedError"
	Forbidden           Code = "PermissionError"
	InternalServer      Code = "InternalServerError"
	InvalidToken        Code = "InvalidTokenError"
	Integrity           Code = "IntegrityError"
	Validation          Code = "ValidationError"
	NotImplemented      Code = "ApiNotImplementedError"
	RateLimitExceeded   Code = "RateLimitExceededError"
	AltchaChallenge     Code = "AltchaChallengeError"
	NotFound            Code = "NotFoundError"
	MethodNotAllowed    Code = "MethodNotAllowedError"
	UnsupportedMedia    Code = "UnsupportedMediaTypeError"
	RequestEntityTooBig Code = "RequestEntityTooLargeError"
)

// User codes.
const (
	UserNotFound           Code = "UserNotFoundError"
	UserBadCredentials     Code = "UserBadCredentialsError"
	UserInvalidPassword    Code = "UserInvalidPasswordError"
	UserAlreadyExists      Code = "UserAlreadyExistsError"
	UserNotUpdatable       Code = "UserNotUpdatableError"
	UserEmailAlreadyExists Code = "UserEmailAlreadyExistsError"
	UserAlreadyVerified    Code = "UserAlreadyVerifiedError"
	UserInactive           Code = "UserInactiveError"
	UserSpecialUIDTaken    Code = "UserSpecialUidTakenError"
)

// ShowType tells the client how prominently to surface the error. The values
// match the Python ErrorShowType enum.
type ShowType int

// Show types.
const (
	ShowSilent       ShowType = 0
	ShowWarn         ShowType = 1
	ShowError        ShowType = 2
	ShowNotification ShowType = 3
	ShowRedirect     ShowType = 9
)

// Error is the wire representation of a failure. It doubles as the response
// body, so a failed request has exactly the same envelope shape as a
// successful one with a null payload.
type Error struct {
	ErrorCode    Code     `json:"errorCode" doc:"Stable machine-readable error code" example:"UserNotFoundError"`
	ErrorMessage string   `json:"errorMessage" doc:"Human-readable detail; may be empty"`
	ShowType     ShowType `json:"showType" doc:"How the client should surface this error"`
	Data         any      `json:"data" doc:"Always null on an error response"`

	status int
	cause  error
}

// Error implements the error interface.
func (e *Error) Error() string {
	if e.ErrorMessage == "" {
		return string(e.ErrorCode)
	}
	return fmt.Sprintf("%s: %s", e.ErrorCode, e.ErrorMessage)
}

// GetStatus implements huma.StatusError, setting the HTTP response status.
func (e *Error) GetStatus() int { return e.status }

// Unwrap exposes the underlying cause for errors.Is and errors.As.
func (e *Error) Unwrap() error { return e.cause }

// New builds an error using the default HTTP status for the code.
func New(code Code, message string) *Error {
	return &Error{
		ErrorCode:    code,
		ErrorMessage: message,
		ShowType:     ShowError,
		status:       StatusFor(code),
	}
}

// WithStatus overrides the HTTP status.
func (e *Error) WithStatus(status int) *Error {
	e.status = status
	return e
}

// WithShowType overrides how the client surfaces the error.
func (e *Error) WithShowType(s ShowType) *Error {
	e.ShowType = s
	return e
}

// Wrap attaches an underlying cause. The cause is never serialized; it exists
// for logging and errors.Is checks.
func (e *Error) Wrap(err error) *Error {
	e.cause = err
	return e
}

// StatusFor maps a code to its default HTTP status.
func StatusFor(code Code) int {
	switch code {
	case Success:
		return http.StatusOK
	case Unauthorized, InvalidToken, UserBadCredentials:
		return http.StatusUnauthorized
	case Forbidden:
		return http.StatusForbidden
	case NotFound, UserNotFound:
		return http.StatusNotFound
	case MethodNotAllowed:
		return http.StatusMethodNotAllowed
	case Integrity, UserAlreadyExists, UserEmailAlreadyExists, UserAlreadyVerified, UserSpecialUIDTaken:
		return http.StatusConflict
	case Validation, UserInvalidPassword, AltchaChallenge, UserNotUpdatable:
		return http.StatusUnprocessableEntity
	case UserInactive:
		return http.StatusBadRequest
	case RateLimitExceeded:
		return http.StatusTooManyRequests
	case UnsupportedMedia:
		return http.StatusUnsupportedMediaType
	case RequestEntityTooBig:
		return http.StatusRequestEntityTooLarge
	case NotImplemented:
		return http.StatusNotImplemented
	default:
		return http.StatusInternalServerError
	}
}

// CodeForStatus maps an HTTP status back to a code. It is used to translate
// errors raised inside huma itself, such as request validation failures,
// into the project's vocabulary.
func CodeForStatus(status int) Code {
	switch status {
	case http.StatusBadRequest:
		return Validation
	case http.StatusUnauthorized:
		return Unauthorized
	case http.StatusForbidden:
		return Forbidden
	case http.StatusNotFound:
		return NotFound
	case http.StatusMethodNotAllowed:
		return MethodNotAllowed
	case http.StatusConflict:
		return Integrity
	case http.StatusRequestEntityTooLarge:
		return RequestEntityTooBig
	case http.StatusUnsupportedMediaType:
		return UnsupportedMedia
	case http.StatusUnprocessableEntity:
		return Validation
	case http.StatusTooManyRequests:
		return RateLimitExceeded
	case http.StatusNotImplemented:
		return NotImplemented
	default:
		if status >= 500 {
			return InternalServer
		}
		return Unknown
	}
}

// As extracts an *Error from an error chain, reporting whether one was found.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}
