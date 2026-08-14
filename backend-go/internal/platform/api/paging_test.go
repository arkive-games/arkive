package api_test

import (
	"math"
	"testing"

	"github.com/arkive-games/arkive/backend-go/internal/platform/api"
)

func TestClampPagingNeverProducesANegativeOffset(t *testing.T) {
	// The case that matters: multiplying before clamping wraps here, and a
	// `> MaxOffset` check cannot catch the negative that comes out. PostgreSQL then
	// rejects the OFFSET, turning a query string into a 500.
	for _, page := range []int{
		math.MaxInt, math.MaxInt - 1, math.MaxInt32, api.MaxOffset, api.MaxOffset + 1,
		1 << 40, 1 << 50,
	} {
		for _, pageSize := range []int{1, 20, 100, 200} {
			limit, offset := api.ClampPaging(page, pageSize, 20, 200)
			if offset < 0 {
				t.Errorf("ClampPaging(%d, %d) offset = %d, want a non-negative offset",
					page, pageSize, offset)
			}
			if offset > api.MaxOffset {
				t.Errorf("ClampPaging(%d, %d) offset = %d, want at most %d",
					page, pageSize, offset, api.MaxOffset)
			}
			if limit < 1 {
				t.Errorf("ClampPaging(%d, %d) limit = %d, want at least 1", page, pageSize, limit)
			}
		}
	}
}

func TestClampPagingOrdinaryCases(t *testing.T) {
	for _, tc := range []struct {
		page, pageSize        int
		wantLimit, wantOffset int32
	}{
		{1, 20, 20, 0},
		{2, 20, 20, 20},
		{5, 30, 30, 120},
		// Out of range or absent sizes fall back to the default rather than erroring.
		{1, 0, 20, 0},
		{1, -5, 20, 0},
		{1, 5000, 20, 0},
		// A page below one is the first page.
		{0, 20, 20, 0},
		{-3, 20, 20, 0},
	} {
		limit, offset := api.ClampPaging(tc.page, tc.pageSize, 20, 200)
		if limit != tc.wantLimit || offset != tc.wantOffset {
			t.Errorf("ClampPaging(%d, %d) = (%d, %d), want (%d, %d)",
				tc.page, tc.pageSize, limit, offset, tc.wantLimit, tc.wantOffset)
		}
	}
}
