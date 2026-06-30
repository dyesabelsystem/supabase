drop policy if exists "anyone can log an unknown question"
  on public.chatbot_unknown_questions;

create policy "validated unknown questions can be logged"
on public.chatbot_unknown_questions for insert
to anon, authenticated
with check (
  char_length(trim(question)) between 1 and 1000
  and jsonb_typeof(context) = 'object'
);
