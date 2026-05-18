ALTER TABLE survey_forms
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'survey',
  ADD COLUMN IF NOT EXISTS allow_audio BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_document BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_anonymous_response BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE survey_forms
  DROP CONSTRAINT IF EXISTS survey_forms_category_check;

ALTER TABLE survey_forms
  ADD CONSTRAINT survey_forms_category_check
  CHECK (category IN ('interview', 'survey', 'observation', 'focus_group', 'document', 'transaction', 'general'));

ALTER TABLE survey_questions
  ADD COLUMN IF NOT EXISTS help_text TEXT;

ALTER TABLE survey_questions
  DROP CONSTRAINT IF EXISTS survey_questions_question_type_check;

ALTER TABLE survey_questions
  ADD CONSTRAINT survey_questions_question_type_check
  CHECK (question_type IN ('short_text', 'long_text', 'single_choice', 'multiple_choice', 'scale_1_5', 'yes_no', 'date', 'number', 'file'));

ALTER TABLE survey_responses
  ADD COLUMN IF NOT EXISTS response_mode TEXT NOT NULL DEFAULT 'form',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE survey_responses
  DROP CONSTRAINT IF EXISTS survey_responses_response_mode_check;

ALTER TABLE survey_responses
  ADD CONSTRAINT survey_responses_response_mode_check
  CHECK (response_mode IN ('form', 'audio', 'interview', 'document', 'observation', 'transaction'));
