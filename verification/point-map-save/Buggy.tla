------------------------------ MODULE Buggy -------------------------------
(* 点位图保存/草稿并发。规则精确到「防抖已落盘」这一刻，避免误报。 *)
EXTENDS Integers, TLC

VARIABLES doc, version, savedAt, serverDoc, inflight, capturedVersion,
          draftDoc, draftExists, saving, editedDuringSave, pendingDraft

vars == <<doc, version, savedAt, serverDoc, inflight, capturedVersion,
          draftDoc, draftExists, saving, editedDuringSave, pendingDraft>>

Docs == {"A", "B"}

TypeOK ==
    /\ doc \in Docs /\ version \in 0..4 /\ savedAt \in 0..4
    /\ serverDoc \in Docs /\ inflight \in Docs /\ capturedVersion \in 0..4
    /\ draftDoc \in Docs /\ draftExists \in BOOLEAN
    /\ saving \in BOOLEAN /\ editedDuringSave \in BOOLEAN /\ pendingDraft \in BOOLEAN

Init ==
    /\ doc = "A" /\ version = 0 /\ savedAt = 0
    /\ serverDoc = "A" /\ inflight = "A" /\ capturedVersion = 0
    /\ draftDoc = "A" /\ draftExists = FALSE
    /\ saving = FALSE /\ editedDuringSave = FALSE /\ pendingDraft = FALSE

(* 用户改一次：置上「该写草稿」的标记（1 秒防抖由此表达） *)
YouEdit(d) ==
    /\ doc # d /\ version < 3 /\ doc' = d /\ version' = version + 1
    /\ editedDuringSave' = (editedDuringSave \/ saving)
    /\ pendingDraft' = TRUE
    /\ UNCHANGED <<savedAt, serverDoc, inflight, capturedVersion, draftDoc, draftExists, saving>>

YouPressSave ==
    /\ ~saving /\ saving' = TRUE
    /\ capturedVersion' = version /\ inflight' = doc
    /\ editedDuringSave' = FALSE
    /\ UNCHANGED <<doc, version, savedAt, serverDoc, draftDoc, draftExists, pendingDraft>>

(* 防抖到期：草稿落盘，标记清空 *)
DraftWrites ==
    /\ pendingDraft
    /\ draftDoc' = doc /\ draftExists' = TRUE /\ pendingDraft' = FALSE
    /\ UNCHANGED <<doc, version, savedAt, serverDoc, inflight, capturedVersion, saving, editedDuringSave>>

(* 服务器返回；两版唯一差别就在这一行 *)
ServerAcks ==
    /\ saving
    /\ serverDoc' = inflight
    /\ savedAt' = capturedVersion
    /\ saving' = FALSE
    /\ draftExists' = FALSE
    /\ UNCHANGED <<doc, version, inflight, capturedVersion, draftDoc, editedDuringSave, pendingDraft>>

Next ==
    \/ (\E d \in Docs : YouEdit(d))
    \/ YouPressSave \/ DraftWrites \/ ServerAcks

Spec == Init /\ [][Next]_vars

(* R1：保存期间的改动，在「防抖已落盘」之后，必须要么已在服务端、要么草稿还在 *)
DuringSaveEditSurvives ==
    (editedDuringSave /\ ~saving /\ ~pendingDraft) =>
        (version <= savedAt \/ (draftExists /\ draftDoc = doc))

=============================================================================
