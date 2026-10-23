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
-- Data for Name: prompt_configuration; Type: TABLE DATA; Schema: your_schema_name; Owner: -
--
INSERT INTO your_schema_name.prompt_configuration (prompt_configuration_id, ai_model_ind_code, ai_model_name, prompt_id, reasoning_effort_ind_code, reasoning_effort, max_output_tokens, is_record_active, created_user, modified_user, version_id, current_prompt, prompt_version) VALUES (36, 'AI_MODEL', 'gpt-5.4-mini', 40, 'REASONING_EFFORT', 'medium', 65000, true, 0, 0, 1, true, 1);