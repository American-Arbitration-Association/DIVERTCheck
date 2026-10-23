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
-- Data for Name: user; Type: TABLE DATA; Schema: your_schema_name; Owner: -
--

INSERT INTO your_schema_name."user" (email, role_ind_code, role_code, password_hash, is_record_active, created_user, modified_user, version_id, failed_login_attempts, is_account_locked, account_locked_until_dttm, last_login_dttm) VALUES ('ADMIN@GMAIL.COM', 'USER_ROLE', 'ADMIN', 'E86F78A8A3CAF0B60D8E74E5942AA6D86DC150CD3C03338AEF25B7D2D7E3ACC7', true, 0, 0, 1, 2, 0, false, NULL, NULL);
