--
-- PostgreSQL database dump
-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.3 (Ubuntu 18.3-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: code_values; Type: TABLE DATA; Schema: your_schema_name; Owner: -
--

INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('USER_ROLE', 'ADMIN', 'Admin', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'gpt-5', 'GPT 5', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('REASONING_EFFORT', 'low', 'Low', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('REASONING_EFFORT', 'medium', 'Medium', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('REASONING_EFFORT', 'high', 'High', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_RESPONSE_STATUS', 'QUEUED', 'Queued', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_RESPONSE_STATUS', 'IN_PROGRESS', 'In Progress', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_RESPONSE_STATUS', 'COMPLETED', 'Completed', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_RESPONSE_STATUS', 'FAILED', 'Failed', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_TYPE', 'ELIGIBILITY_CHECK_RESPONSE', 'Eligibility Check Response', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'QUEUED', 'Queued', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'PROCESSING', 'Processing', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'COMPLETED', 'Completed', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'FAILED', 'Failed', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'RETRY', 'Retry', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('DOCUMENT_SUBMITTED_BY', 'P', 'Plaintiff', 'Plaintiff', 'N', 1, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('DOCUMENT_SUBMITTED_BY', 'D', 'Defendant', 'Defendant', 'N', 2, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('PROMPT_TYPE', 'Vision', 'Vision', 'Prompt used for extracting readable text from uploaded documents.', 'N', 1, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('PROMPT_TYPE', 'Suggested', 'Suggested', 'Prompt type used to generate prompt suggestions. Suggested prompts can include both main prompt text and summary prompt text.', 'N', 2, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('PROMPT_TYPE', 'Eligibility', 'Eligibility', 'Prompt type used for eligibility review. Eligibility prompts can include both main eligibility prompt text and outcome summary prompt text.', 'Y', 3, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'gpt-5.4-mini', 'gpt-5.4-mini', 'GPT-5.4 Mini', 'Y', 1, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'gpt-5-mini', 'GPT 5 Mini', NULL, 'N', NULL, 'N', false, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_RESPONSE_STATUS', 'CANCELED', 'Canceled', 'AI response generation was canceled before completion.', 'N', 14, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'CANCELED', 'Canceled', 'AI job was canceled before completion.', 'N', 21, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_TYPE', 'SUGGESTED_PROMPT', 'Suggested prompt', 'Generates suggested eligibility or outcome-summary prompt text.', 'N', 2, 'N', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'gpt-5.6-luna', 'GPT-5.6 Luna', NULL, 'N', 60, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'gpt-5.6-terra', 'GPT-5.6 Terra', NULL, 'N', 70, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'grok-4.3', 'grok-4.3', 'xAI Grok 4.3 deployed through Azure AI Foundry', 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('USER_ROLE', 'USER', 'User', NULL, 'N', NULL, 'Y', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('PROMPT_TYPE', 'Transaction', 'Transaction', 'Financial transaction and monetary-value extraction prompt.', 'N', NULL, 'N', true, 0, 0, 1);
INSERT INTO your_schema_name.code_values (code_type_code, value, short_description, long_description, default_value_flag, sort_order, user_visible_flag, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_TYPE', 'PROMPT_GENERATION_RESPONSE', 'Prompt Generation Response', NULL, 'N', NULL, 'Y', false, 0, 0, 1);

