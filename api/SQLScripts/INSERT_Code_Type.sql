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
-- Data for Name: code_types; Type: TABLE DATA; Schema: your_schema_name; Owner: -
--

INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('USER_ROLE', 'User Role', NULL, NULL, true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('AI_MODEL', 'AI Model', NULL, NULL, true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('REASONING_EFFORT', 'Reasoning Effort', NULL, NULL, true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('AI_RESPONSE_STATUS', 'AI Response Status', NULL, NULL, true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_TYPE', 'Job Type', NULL, NULL, true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('JOB_STATUS', 'Job Status', NULL, NULL, true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('DOCUMENT_SUBMITTED_BY', 'Document Submitted By', 'Document Submitted By', 'Allowed values for the document Submitted By dropdown.', true, 0, 0, 1);
INSERT INTO your_schema_name.code_types (code_type_code, label, short_description, long_description, is_record_active, created_user, modified_user, version_id) VALUES ('PROMPT_TYPE', 'Prompt Type', 'Prompt Type', 'Classifies prompt rows as vision extraction, suggested prompt generation, or eligibility review prompts.', true, 0, 0, 1);


