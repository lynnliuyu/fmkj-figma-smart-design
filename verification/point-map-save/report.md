# Buggy

TLC reached 144 states and 297 steps. The chart draws 144 states and 297 arrows.

## DuringSaveEditSurvives breaks

The shortest path has 4 steps: 0. pendingDraft=FALSE doc="A" capturedVersion=0 savedAt=0 inflight="A" version=0 draftExists=FALSE saving=FALSE serverDoc="A" draftDoc="A" editedDuringSave=FALSE

1. YouPressSave: pendingDraft=FALSE doc="A" capturedVersion=0 savedAt=0 inflight="A" version=0 draftExists=FALSE saving=TRUE serverDoc="A" draftDoc="A" editedDuringSave=FALSE
2. YouEdit: pendingDraft=TRUE doc="B" capturedVersion=0 savedAt=0 inflight="A" version=1 draftExists=FALSE saving=TRUE serverDoc="A" draftDoc="A" editedDuringSave=TRUE
3. DraftWrites: pendingDraft=FALSE doc="B" capturedVersion=0 savedAt=0 inflight="A" version=1 draftExists=TRUE saving=TRUE serverDoc="A" draftDoc="B" editedDuringSave=TRUE
4. ServerAcks: pendingDraft=FALSE doc="B" capturedVersion=0 savedAt=0 inflight="A" version=1 draftExists=FALSE saving=FALSE serverDoc="A" draftDoc="B" editedDuringSave=TRUE

## Rules that hold

TypeOK, NoDeadlock
