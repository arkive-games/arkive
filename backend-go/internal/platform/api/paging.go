package api

// MaxOffset bounds page * pageSize.
//
// The offset reaches PostgreSQL as an int32, so it has to fit one. The bound is well
// under that on purpose: nothing legitimate pages a billion rows deep, and leaving room
// means the clamp is never the thing that overflows.
const MaxOffset = 1 << 30

// ClampPaging turns a page number and size into a bounded LIMIT and OFFSET.
//
// **The page is clamped before it is multiplied, and that ordering is the whole point.**
// Multiplying first overflows `int` for a large page — `page=9223372036854775807` with
// `pageSize=20` wraps to a negative number — and a `> MaxOffset` check cannot catch a
// negative, so the negative offset reaches PostgreSQL, which rejects it. That is a 500
// from a query string, on routes that are reachable without signing in.
//
// This was measured once, fixed in the forum's ListFilter, and then reintroduced in three
// new packages that each wrote the arithmetic out again. It lives here now so that the
// next paginated endpoint gets the fix by construction rather than by remembering.
//
// Asking beyond the end is answered with an empty page rather than an error, which is what
// a client walking to the end expects anyway.
func ClampPaging(page, pageSize, defaultPageSize, maxPageSize int) (limit int32, offset int32) {
	if pageSize < 1 || pageSize > maxPageSize {
		pageSize = defaultPageSize
	}
	if page < 1 {
		page = 1
	}
	if maxPage := MaxOffset/pageSize + 1; page > maxPage {
		page = maxPage
	}
	return int32(pageSize), int32((page - 1) * pageSize)
}
