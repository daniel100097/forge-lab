package spaui

import "testing"

func TestTimelinePage(tester *testing.T) {
	visible := make([]int64, 105)
	for index := range visible {
		visible[index] = int64(index*2 + 2)
	}
	for _, test := range []struct {
		name   string
		page   int
		anchor int64
		want   int
	}{
		{"first boundary", 3, 100, 1},
		{"second page", 1, 102, 2},
		{"last page", 1, 210, 3},
		{"hidden anchor keeps page", 2, 101, 2},
		{"missing anchor clamps page", 999, 999, 3},
		{"negative page", -4, 0, 1},
		{"ordinary pagination", 2, 0, 2},
	} {
		tester.Run(test.name, func(tester *testing.T) {
			if got := TimelinePage(visible, test.page, test.anchor); got != test.want {
				tester.Fatalf("page = %d, want %d", got, test.want)
			}
		})
	}
	if got := TimelinePage(nil, 3, 42); got != 1 {
		tester.Fatalf("empty page = %d, want 1", got)
	}
}
