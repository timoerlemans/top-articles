/** Feedback is a trailing paragraph; everything before it remains content evidence. */
export function splitReadingFeedback(notes: string | null | undefined): {
  contentNotes: string | null | undefined;
  feedback: string | null;
} {
  if (!notes) {return { contentNotes: notes, feedback: null };}
  const marker = /(?:^|\r?\n[\t ]*\r?\n|\r?\n)[\t ]*Feedback:[\t ]*/i.exec(notes);
  if (!marker) {return { contentNotes: notes, feedback: null };}
  return {
    contentNotes: notes.slice(0, marker.index) || null,
    feedback: notes.slice(marker.index + marker[0].length).trim() || null,
  };
}

/** Only these two fields may be published; the feedback paragraph stays private. */
export function publicReadingNotes(notes: string | null | undefined): { whyRead: string | null; bestMoment: string | null } {
  const { contentNotes } = splitReadingFeedback(notes);
  if (!contentNotes) {return { whyRead: null, bestMoment: null };}
  const whyMatch = contentNotes.match(/Waarom lezen:\s*([\s\S]*?)\n\s*Beste moment:/i);
  const momentMatch = contentNotes.match(/Beste moment:[\t ]*([^\r\n]*)/i);
  return { whyRead: whyMatch?.[1]?.trim() ?? null, bestMoment: momentMatch?.[1]?.trim() ?? null };
}
