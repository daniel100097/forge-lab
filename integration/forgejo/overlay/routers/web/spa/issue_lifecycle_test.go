package spa

import (
	"testing"

	issues_model "forgejo.org/models/issues"
	user_model "forgejo.org/models/user"
)

func TestIssueParticipantsExcludeUnpublishedReviews(t *testing.T) {
	published := &user_model.User{ID: 1, Name: "zz-test-published"}
	pending := &user_model.User{ID: 2, Name: "zz-test-pending"}
	event := &user_model.User{ID: 3, Name: "zz-test-event"}
	comments := issues_model.CommentList{
		{Type: issues_model.CommentTypeCode, Poster: published, Review: &issues_model.Review{Type: issues_model.ReviewTypeComment}},
		{Type: issues_model.CommentTypeCode, Poster: pending, Review: &issues_model.Review{Type: issues_model.ReviewTypePending}},
		{Type: issues_model.CommentTypeReview, Poster: pending, Review: &issues_model.Review{Type: issues_model.ReviewTypePending}},
		{Type: issues_model.CommentTypeLabel, Poster: event},
		{Type: issues_model.CommentTypeAggregator, Poster: event},
	}
	participants := issueParticipantUsers(comments)
	if len(participants) != 1 || participants[0].ID != published.ID {
		t.Fatalf("participants contain unpublished reviewers or metadata actors: %#v", participants)
	}
}
