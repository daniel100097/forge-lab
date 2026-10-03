package spa

import (
	"testing"

	repo_model "forgejo.org/models/repo"
)

func TestPullMergeStyleEligible(t *testing.T) {
	config := &repo_model.PullRequestsConfig{AllowMerge: true, AllowRebase: true, AllowRebaseMerge: true, AllowSquash: true, AllowFastForwardOnly: true, AllowManualMerge: true}
	styles := []repo_model.MergeStyle{repo_model.MergeStyleMerge, repo_model.MergeStyleRebase, repo_model.MergeStyleRebaseMerge, repo_model.MergeStyleSquash, repo_model.MergeStyleFastForwardOnly, repo_model.MergeStyleManuallyMerged}
	for _, style := range styles {
		t.Run(string(style), func(t *testing.T) {
			if !pullMergeStyleEligible(config, style, false, 0, true, false) {
				t.Fatal("configured style must be eligible in a mergeable unsigned branch")
			}
			unsigned := style == repo_model.MergeStyleFastForwardOnly || style == repo_model.MergeStyleManuallyMerged
			if actual := pullMergeStyleEligible(config, style, true, 0, true, false); actual != unsigned {
				t.Fatalf("signing blocked: got %v, want %v", actual, unsigned)
			}
			if pullMergeStyleEligible(config, style, false, 0, false, false) {
				t.Fatal("inactive general and manual forms must not expose merge styles")
			}
			manual := style == repo_model.MergeStyleManuallyMerged
			if actual := pullMergeStyleEligible(config, style, true, 4, false, true); actual != manual {
				t.Fatalf("manual fallback: got %v, want %v", actual, manual)
			}
			if pullMergeStyleEligible(&repo_model.PullRequestsConfig{}, style, false, 0, true, true) {
				t.Fatal("repository-disabled style must remain unavailable")
			}
		})
	}
	if pullMergeStyleEligible(config, repo_model.MergeStyleFastForwardOnly, false, 1, true, false) {
		t.Fatal("fast-forward must not be offered when the source is behind")
	}
	if pullMergeStyleEligible(config, repo_model.MergeStyleFastForwardOnly, true, 1, true, false) {
		t.Fatal("signing exemption must not override fast-forward divergence eligibility")
	}
}
