package spaui

func TimelinePage(visibleIDs []int64, requestedPage int, anchorID int64) int {
	for index, id := range visibleIDs {
		if anchorID > 0 && id == anchorID {
			return index/50 + 1
		}
	}
	lastPage := max(1, (len(visibleIDs)+49)/50)
	return min(max(1, requestedPage), lastPage)
}
