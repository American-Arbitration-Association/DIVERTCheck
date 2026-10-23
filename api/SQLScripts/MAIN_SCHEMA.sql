--
-- PostgreSQL database dump
--
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
-- Name: your_schema_name; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA your_schema_name;


--
-- Name: audit_bi_fn(); Type: FUNCTION; Schema: your_schema_name; Owner: -
--

CREATE FUNCTION your_schema_name.audit_bi_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_ctx_user          BIGINT := 0;
    v_client_identifier TEXT;
BEGIN
    v_client_identifier := current_setting('my.client_identifier', true);

    IF v_client_identifier IS NOT NULL
       AND btrim(v_client_identifier) ~ '^-?\d+(\.\d+)?$' THEN
        v_ctx_user := btrim(v_client_identifier)::numeric(10,0)::bigint;
    END IF;

    IF NEW.created_user IS NULL OR NEW.created_user = 0 THEN
        NEW.created_user := v_ctx_user;
    END IF;

    NEW.created_dttm := clock_timestamp();

    IF NEW.modified_user IS NULL OR NEW.modified_user = 0 THEN
        NEW.modified_user := v_ctx_user;
    END IF;

    NEW.modified_dttm := clock_timestamp();

    RETURN NEW;
END;
$_$;


--
-- Name: audit_bu_fn(); Type: FUNCTION; Schema: your_schema_name; Owner: -
--

CREATE FUNCTION your_schema_name.audit_bu_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_ctx_user          BIGINT := 0;
    v_client_identifier TEXT;
BEGIN
    v_client_identifier := current_setting('my.client_identifier', true);

    IF v_client_identifier IS NOT NULL
       AND btrim(v_client_identifier) ~ '^-?\d+(\.\d+)?$' THEN
        v_ctx_user := btrim(v_client_identifier)::numeric(10,0)::bigint;
    END IF;

    NEW.created_user := OLD.created_user;
    NEW.created_dttm := OLD.created_dttm;

    IF NEW.modified_user IS NULL OR NEW.modified_user = 0 THEN
        NEW.modified_user := v_ctx_user;
    END IF;

    NEW.modified_dttm := clock_timestamp();
    NEW.version_id := COALESCE(OLD.version_id, 0) + 1;

    RETURN NEW;
END;
$_$;


--
-- Name: set_prompt_configuration_version(); Type: FUNCTION; Schema: your_schema_name; Owner: -
--

CREATE FUNCTION your_schema_name.set_prompt_configuration_version() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.prompt_version IS NULL OR NEW.prompt_version <= 0 THEN
        SELECT COALESCE(MAX(prompt_version), 0) + 1
        INTO NEW.prompt_version
        FROM your_schema_name.prompt_configuration;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: set_prompt_configuration_version_on_prompt_change(); Type: FUNCTION; Schema: your_schema_name; Owner: -
--

CREATE FUNCTION your_schema_name.set_prompt_configuration_version_on_prompt_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.prompt_id IS DISTINCT FROM OLD.prompt_id THEN
        NEW.version_id := COALESCE(OLD.version_id, 0) + 1;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: user_email_lowercase_fn(); Type: FUNCTION; Schema: your_schema_name; Owner: -
--

CREATE FUNCTION your_schema_name.user_email_lowercase_fn() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.email IS NOT NULL THEN
        NEW.email := lower(trim(NEW.email));
    END IF;
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_job_queue; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.ai_job_queue (
    job_id bigint CONSTRAINT aijobqueue_job_id_not_null NOT NULL,
    ai_response_id bigint,
    job_type_ind_code character varying(100) DEFAULT 'JOB_TYPE'::character varying CONSTRAINT aijobqueue_job_type_ind_code_not_null NOT NULL,
    job_type character varying(100) CONSTRAINT aijobqueue_job_type_not_null NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb CONSTRAINT aijobqueue_payload_not_null NOT NULL,
    job_status_ind_code character varying(100) DEFAULT 'JOB_STATUS'::character varying CONSTRAINT aijobqueue_job_status_ind_code_not_null NOT NULL,
    job_status character varying(100) DEFAULT 'QUEUED'::character varying CONSTRAINT aijobqueue_job_status_not_null NOT NULL,
    attempts integer DEFAULT 0 CONSTRAINT aijobqueue_attempts_not_null NOT NULL,
    max_attempts integer DEFAULT 3 CONSTRAINT aijobqueue_max_attempts_not_null NOT NULL,
    scheduled_at timestamp with time zone DEFAULT now() CONSTRAINT aijobqueue_scheduled_at_not_null NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message character varying(500),
    job_priority smallint DEFAULT 5 CONSTRAINT aijobqueue_job_priority_not_null NOT NULL,
    is_record_active boolean DEFAULT true CONSTRAINT aijobqueue_is_record_active_not_null NOT NULL,
    created_user bigint DEFAULT 0 CONSTRAINT aijobqueue_created_user_not_null NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() CONSTRAINT aijobqueue_created_dttm_not_null NOT NULL,
    modified_user bigint DEFAULT 0 CONSTRAINT aijobqueue_modified_user_not_null NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() CONSTRAINT aijobqueue_modified_dttm_not_null NOT NULL,
    version_id integer DEFAULT 1 CONSTRAINT aijobqueue_version_id_not_null NOT NULL,
    prompt_suggestion_response_id bigint
);


--
-- Name: ai_response; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.ai_response (
    ai_response_id bigint CONSTRAINT airesponse_ai_response_id_not_null NOT NULL,
    case_id bigint CONSTRAINT airesponse_case_id_not_null NOT NULL,
    ai_status_ind_code character varying(100) DEFAULT 'AI_RESPONSE_STATUS'::character varying CONSTRAINT airesponse_ai_status_ind_code_not_null NOT NULL,
    ai_status character varying(100) CONSTRAINT airesponse_ai_status_not_null NOT NULL,
    ai_full_response text,
    ai_summary_response text,
    prompt_configuration_id bigint CONSTRAINT airesponse_prompt_configuration_id_not_null NOT NULL,
    completed_at timestamp with time zone,
    is_record_active boolean DEFAULT true CONSTRAINT airesponse_is_record_active_not_null NOT NULL,
    created_user bigint DEFAULT 0 CONSTRAINT airesponse_created_user_not_null NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() CONSTRAINT airesponse_created_dttm_not_null NOT NULL,
    modified_user bigint DEFAULT 0 CONSTRAINT airesponse_modified_user_not_null NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() CONSTRAINT airesponse_modified_dttm_not_null NOT NULL,
    version_id integer DEFAULT 1 CONSTRAINT airesponse_version_id_not_null NOT NULL,
    review_version integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_ai_response_review_version_nonnegative CHECK ((review_version >= 0))
);


--
-- Name: ai_response_document; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.ai_response_document (
    ai_response_document_id bigint CONSTRAINT airesponsedocument_ai_response_document_id_not_null NOT NULL,
    document_id bigint CONSTRAINT airesponsedocument_document_id_not_null NOT NULL,
    ai_response_id bigint CONSTRAINT airesponsedocument_ai_response_id_not_null NOT NULL,
    is_record_active boolean DEFAULT true CONSTRAINT airesponsedocument_is_record_active_not_null NOT NULL,
    created_user bigint DEFAULT 0 CONSTRAINT airesponsedocument_created_user_not_null NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() CONSTRAINT airesponsedocument_created_dttm_not_null NOT NULL,
    modified_user bigint DEFAULT 0 CONSTRAINT airesponsedocument_modified_user_not_null NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() CONSTRAINT airesponsedocument_modified_dttm_not_null NOT NULL,
    version_id integer DEFAULT 1 CONSTRAINT airesponsedocument_version_id_not_null NOT NULL
);


--
-- Name: aijobqueue_job_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.ai_job_queue ALTER COLUMN job_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME your_schema_name.aijobqueue_job_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: airesponse_ai_response_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.ai_response ALTER COLUMN ai_response_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.airesponse_ai_response_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: airesponsedocument_ai_response_document_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.ai_response_document ALTER COLUMN ai_response_document_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.airesponsedocument_ai_response_document_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: case_documents; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.case_documents (
    document_id bigint CONSTRAINT casedocuments_document_id_not_null NOT NULL,
    case_id bigint CONSTRAINT casedocuments_case_id_not_null NOT NULL,
    document_name character varying(255) CONSTRAINT casedocuments_document_name_not_null NOT NULL,
    azure_storage_id character varying(255) CONSTRAINT casedocuments_azure_storage_id_not_null NOT NULL,
    uploaded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP CONSTRAINT casedocuments_uploaded_at_not_null NOT NULL,
    file_size bigint,
    is_record_active boolean DEFAULT true CONSTRAINT casedocuments_is_record_active_not_null NOT NULL,
    created_user bigint DEFAULT 0 CONSTRAINT casedocuments_created_user_not_null NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() CONSTRAINT casedocuments_created_dttm_not_null NOT NULL,
    modified_user bigint DEFAULT 0 CONSTRAINT casedocuments_modified_user_not_null NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() CONSTRAINT casedocuments_modified_dttm_not_null NOT NULL,
    version_id integer DEFAULT 1 CONSTRAINT casedocuments_version_id_not_null NOT NULL,
    submitted_by_ind_code character varying(100) DEFAULT 'DOCUMENT_SUBMITTED_BY'::character varying NOT NULL,
    submitted_by character varying(100),
    is_financial_document boolean DEFAULT false NOT NULL
);


--
-- Name: casedocuments_document_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.case_documents ALTER COLUMN document_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.casedocuments_document_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cases; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.cases (
    case_id bigint NOT NULL,
    case_number character varying(100) NOT NULL,
    case_name character varying(255) NOT NULL,
    filing_date date,
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL
);


--
-- Name: cases_case_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.cases ALTER COLUMN case_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.cases_case_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: code_types; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.code_types (
    code_type_code character varying(100) NOT NULL,
    label character varying(100) NOT NULL,
    short_description character varying(100),
    long_description character varying(256),
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL
);


--
-- Name: code_values; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.code_values (
    code_values_id bigint NOT NULL,
    code_type_code character varying(100) NOT NULL,
    value character varying(100) NOT NULL,
    short_description character varying(100) NOT NULL,
    long_description character varying(256),
    default_value_flag character(1) DEFAULT 'N'::bpchar,
    sort_order bigint,
    user_visible_flag character(1) DEFAULT 'Y'::bpchar,
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL,
    CONSTRAINT cv_default_value_flag_ck CHECK ((default_value_flag = ANY (ARRAY['Y'::bpchar, 'N'::bpchar]))),
    CONSTRAINT cv_user_visible_flag_ck CHECK ((user_visible_flag = ANY (ARRAY['Y'::bpchar, 'N'::bpchar])))
);


--
-- Name: code_values_code_values_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.code_values ALTER COLUMN code_values_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.code_values_code_values_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: document_vision_extractions; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.document_vision_extractions (
    document_vision_extraction_id bigint CONSTRAINT document_vision_extractions_document_vision_extraction_not_null NOT NULL,
    document_id bigint NOT NULL,
    document_hash character(64) NOT NULL,
    vision_extracted_azure_document_id text,
    prompt_configuration_id bigint NOT NULL,
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL
);


--
-- Name: document_vision_extractions_document_vision_extraction_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.document_vision_extractions ALTER COLUMN document_vision_extraction_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.document_vision_extractions_document_vision_extraction_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prompt_configuration; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.prompt_configuration (
    prompt_configuration_id bigint CONSTRAINT promptconfiguration_prompt_configuration_id_not_null NOT NULL,
    ai_model_ind_code character varying(100) DEFAULT 'AI_MODEL'::character varying CONSTRAINT promptconfiguration_ai_model_ind_code_not_null NOT NULL,
    ai_model_name character varying(100) CONSTRAINT promptconfiguration_ai_model_name_not_null NOT NULL,
    prompt_id bigint CONSTRAINT promptconfiguration_prompt_id_not_null NOT NULL,
    reasoning_effort_ind_code character varying(100),
    reasoning_effort character varying(100),
    max_output_tokens integer,
    is_record_active boolean DEFAULT true CONSTRAINT promptconfiguration_is_record_active_not_null NOT NULL,
    created_user bigint DEFAULT 0 CONSTRAINT promptconfiguration_created_user_not_null NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() CONSTRAINT promptconfiguration_created_dttm_not_null NOT NULL,
    modified_user bigint DEFAULT 0 CONSTRAINT promptconfiguration_modified_user_not_null NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() CONSTRAINT promptconfiguration_modified_dttm_not_null NOT NULL,
    version_id integer DEFAULT 1 CONSTRAINT promptconfiguration_version_id_not_null NOT NULL,
    current_prompt boolean DEFAULT false NOT NULL,
    prompt_version integer NOT NULL,
    CONSTRAINT ck_prompt_configuration_current_prompt_active CHECK (((NOT current_prompt) OR is_record_active))
);


--
-- Name: prompt_suggestion_response; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.prompt_suggestion_response (
    prompt_suggestion_response_id bigint CONSTRAINT prompt_suggestion_response_prompt_suggestion_response__not_null NOT NULL,
    prompt_configuration_id bigint NOT NULL,
    prompt_type character varying(100) NOT NULL,
    ai_status_ind_code character varying(100) DEFAULT 'AI_RESPONSE_STATUS'::character varying NOT NULL,
    ai_status character varying(100) DEFAULT 'COMPLETED'::character varying NOT NULL,
    generated_prompt text,
    raw_response jsonb,
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL
);


--
-- Name: prompt_suggestion_response_prompt_suggestion_response_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.prompt_suggestion_response ALTER COLUMN prompt_suggestion_response_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME your_schema_name.prompt_suggestion_response_prompt_suggestion_response_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: promptconfiguration_prompt_configuration_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.prompt_configuration ALTER COLUMN prompt_configuration_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.promptconfiguration_prompt_configuration_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: prompts; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name.prompts (
    prompt_id bigint NOT NULL,
    main_prompt_text text,
    summary_prompt_text text,
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL,
    prompt_type character varying(100)
);


--
-- Name: prompts_prompt_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name.prompts ALTER COLUMN prompt_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.prompts_prompt_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: user; Type: TABLE; Schema: your_schema_name; Owner: -
--

CREATE TABLE your_schema_name."user" (
    user_id bigint NOT NULL,
    email character varying(255) NOT NULL,
    role_ind_code character varying(100) DEFAULT 'USER_ROLE'::character varying NOT NULL,
    role_code character varying(100) NOT NULL,
    password_hash text NOT NULL,
    is_record_active boolean DEFAULT true NOT NULL,
    created_user bigint DEFAULT 0 NOT NULL,
    created_dttm timestamp without time zone DEFAULT now() NOT NULL,
    modified_user bigint DEFAULT 0 NOT NULL,
    modified_dttm timestamp without time zone DEFAULT now() NOT NULL,
    version_id integer DEFAULT 1 NOT NULL,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    is_account_locked boolean DEFAULT false NOT NULL,
    account_locked_until_dttm timestamp without time zone,
    last_login_dttm timestamp without time zone,
    CONSTRAINT ck_user_account_lock_expiry CHECK (((NOT is_account_locked) OR (account_locked_until_dttm IS NOT NULL))),
    CONSTRAINT ck_user_failed_login_attempts_nonnegative CHECK ((failed_login_attempts >= 0))
);


--
-- Name: user_user_id_seq; Type: SEQUENCE; Schema: your_schema_name; Owner: -
--

ALTER TABLE your_schema_name."user" ALTER COLUMN user_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME your_schema_name.user_user_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ai_job_queue aijobqueue_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_job_queue
    ADD CONSTRAINT aijobqueue_pkey PRIMARY KEY (job_id);


--
-- Name: ai_response airesponse_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response
    ADD CONSTRAINT airesponse_pkey PRIMARY KEY (ai_response_id);


--
-- Name: ai_response_document airesponsedocument_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response_document
    ADD CONSTRAINT airesponsedocument_pkey PRIMARY KEY (ai_response_document_id);


--
-- Name: case_documents casedocuments_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.case_documents
    ADD CONSTRAINT casedocuments_pkey PRIMARY KEY (document_id);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (case_id);


--
-- Name: code_types code_types_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.code_types
    ADD CONSTRAINT code_types_pkey PRIMARY KEY (code_type_code);


--
-- Name: code_values code_values_pk; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.code_values
    ADD CONSTRAINT code_values_pk PRIMARY KEY (code_type_code, value);


--
-- Name: document_vision_extractions documentvisionextractions_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.document_vision_extractions
    ADD CONSTRAINT documentvisionextractions_pkey PRIMARY KEY (document_vision_extraction_id);


--
-- Name: prompt_suggestion_response prompt_suggestion_response_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompt_suggestion_response
    ADD CONSTRAINT prompt_suggestion_response_pkey PRIMARY KEY (prompt_suggestion_response_id);


--
-- Name: prompt_configuration promptconfiguration_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompt_configuration
    ADD CONSTRAINT promptconfiguration_pkey PRIMARY KEY (prompt_configuration_id);


--
-- Name: prompts prompts_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompts
    ADD CONSTRAINT prompts_pkey PRIMARY KEY (prompt_id);


--
-- Name: ai_response_document uq_airesponsedocument; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response_document
    ADD CONSTRAINT uq_airesponsedocument UNIQUE (document_id, ai_response_id);


--
-- Name: case_documents uq_casedocuments_azure_storage_id; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.case_documents
    ADD CONSTRAINT uq_casedocuments_azure_storage_id UNIQUE (azure_storage_id);


--
-- Name: cases uq_cases_case_number; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.cases
    ADD CONSTRAINT uq_cases_case_number UNIQUE (case_number);


--
-- Name: document_vision_extractions uq_documentvisionextractions_document_prompt; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.document_vision_extractions
    ADD CONSTRAINT uq_documentvisionextractions_document_prompt UNIQUE (document_id, prompt_configuration_id);


--
-- Name: user uq_user_email; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name."user"
    ADD CONSTRAINT uq_user_email UNIQUE (email);


--
-- Name: user user_pkey; Type: CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name."user"
    ADD CONSTRAINT user_pkey PRIMARY KEY (user_id);


--
-- Name: idx_ai_job_queue_prompt_suggestion_response_id; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_ai_job_queue_prompt_suggestion_response_id ON your_schema_name.ai_job_queue USING btree (prompt_suggestion_response_id);


--
-- Name: idx_aijobqueue_airesponseid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_aijobqueue_airesponseid ON your_schema_name.ai_job_queue USING btree (ai_response_id);


--
-- Name: idx_aijobqueue_queued_only; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_aijobqueue_queued_only ON your_schema_name.ai_job_queue USING btree (scheduled_at, job_priority) WHERE (((job_status)::text = 'QUEUED'::text) AND (is_record_active = true));


--
-- Name: idx_aijobqueue_status_type_sched; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_aijobqueue_status_type_sched ON your_schema_name.ai_job_queue USING btree (job_status, job_type, scheduled_at);


--
-- Name: idx_airesponse_caseid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_airesponse_caseid ON your_schema_name.ai_response USING btree (case_id);


--
-- Name: idx_airesponse_caseid_createddttm; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_airesponse_caseid_createddttm ON your_schema_name.ai_response USING btree (case_id, created_dttm DESC);


--
-- Name: idx_airesponse_promptconfigurationid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_airesponse_promptconfigurationid ON your_schema_name.ai_response USING btree (prompt_configuration_id);


--
-- Name: idx_airesponsedocument_airesponseid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_airesponsedocument_airesponseid ON your_schema_name.ai_response_document USING btree (ai_response_id);


--
-- Name: idx_airesponsedocument_documentid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_airesponsedocument_documentid ON your_schema_name.ai_response_document USING btree (document_id);


--
-- Name: idx_casedocuments_caseid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_casedocuments_caseid ON your_schema_name.case_documents USING btree (case_id);


--
-- Name: idx_casedocuments_caseid_uploadedat; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_casedocuments_caseid_uploadedat ON your_schema_name.case_documents USING btree (case_id, uploaded_at DESC);


--
-- Name: idx_casedocuments_submitted_by; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_casedocuments_submitted_by ON your_schema_name.case_documents USING btree (submitted_by_ind_code, submitted_by);


--
-- Name: idx_documentvisionextractions_documenthash; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_documentvisionextractions_documenthash ON your_schema_name.document_vision_extractions USING btree (document_hash);


--
-- Name: idx_documentvisionextractions_promptconfigurationid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_documentvisionextractions_promptconfigurationid ON your_schema_name.document_vision_extractions USING btree (prompt_configuration_id);


--
-- Name: idx_prompt_suggestion_response_prompt_configuration_id; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_prompt_suggestion_response_prompt_configuration_id ON your_schema_name.prompt_suggestion_response USING btree (prompt_configuration_id);


--
-- Name: idx_prompt_suggestion_response_status; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_prompt_suggestion_response_status ON your_schema_name.prompt_suggestion_response USING btree (ai_status_ind_code, ai_status);


--
-- Name: idx_promptconfiguration_promptid; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE INDEX idx_promptconfiguration_promptid ON your_schema_name.prompt_configuration USING btree (prompt_id);


--
-- Name: uq_prompt_configuration_one_current_active; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE UNIQUE INDEX uq_prompt_configuration_one_current_active ON your_schema_name.prompt_configuration USING btree (current_prompt) WHERE ((current_prompt = true) AND (is_record_active = true));


--
-- Name: ux_ai_response_case_review_version_completed; Type: INDEX; Schema: your_schema_name; Owner: -
--

CREATE UNIQUE INDEX ux_ai_response_case_review_version_completed ON your_schema_name.ai_response USING btree (case_id, review_version) WHERE ((is_record_active = true) AND ((ai_status)::text = 'COMPLETED'::text) AND (review_version > 0));


--
-- Name: ai_job_queue aijobqueue_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER aijobqueue_bi_1 BEFORE INSERT ON your_schema_name.ai_job_queue FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: ai_job_queue aijobqueue_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER aijobqueue_bu_1 BEFORE UPDATE ON your_schema_name.ai_job_queue FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: ai_response airesponse_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER airesponse_bi_1 BEFORE INSERT ON your_schema_name.ai_response FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: ai_response airesponse_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER airesponse_bu_1 BEFORE UPDATE ON your_schema_name.ai_response FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: ai_response_document airesponsedocument_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER airesponsedocument_bi_1 BEFORE INSERT ON your_schema_name.ai_response_document FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: ai_response_document airesponsedocument_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER airesponsedocument_bu_1 BEFORE UPDATE ON your_schema_name.ai_response_document FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: case_documents casedocuments_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER casedocuments_bi_1 BEFORE INSERT ON your_schema_name.case_documents FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: case_documents casedocuments_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER casedocuments_bu_1 BEFORE UPDATE ON your_schema_name.case_documents FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: cases cases_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER cases_bi_1 BEFORE INSERT ON your_schema_name.cases FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: cases cases_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER cases_bu_1 BEFORE UPDATE ON your_schema_name.cases FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: document_vision_extractions documentvisionextractions_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER documentvisionextractions_bi_1 BEFORE INSERT ON your_schema_name.document_vision_extractions FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: document_vision_extractions documentvisionextractions_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER documentvisionextractions_bu_1 BEFORE UPDATE ON your_schema_name.document_vision_extractions FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: prompt_suggestion_response prompt_suggestion_response_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER prompt_suggestion_response_bi_1 BEFORE INSERT ON your_schema_name.prompt_suggestion_response FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: prompt_suggestion_response prompt_suggestion_response_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER prompt_suggestion_response_bu_1 BEFORE UPDATE ON your_schema_name.prompt_suggestion_response FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: prompt_configuration promptconfiguration_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER promptconfiguration_bi_1 BEFORE INSERT ON your_schema_name.prompt_configuration FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: prompt_configuration promptconfiguration_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER promptconfiguration_bu_1 BEFORE UPDATE ON your_schema_name.prompt_configuration FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: prompts prompts_bi_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER prompts_bi_1 BEFORE INSERT ON your_schema_name.prompts FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bi_fn();


--
-- Name: prompts prompts_bu_1; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER prompts_bu_1 BEFORE UPDATE ON your_schema_name.prompts FOR EACH ROW EXECUTE FUNCTION your_schema_name.audit_bu_fn();


--
-- Name: prompt_configuration trg_prompt_configuration_prompt_id_version; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER trg_prompt_configuration_prompt_id_version BEFORE UPDATE OF prompt_id ON your_schema_name.prompt_configuration FOR EACH ROW EXECUTE FUNCTION your_schema_name.set_prompt_configuration_version_on_prompt_change();


--
-- Name: prompt_configuration trg_set_prompt_configuration_version; Type: TRIGGER; Schema: your_schema_name; Owner: -
--

CREATE TRIGGER trg_set_prompt_configuration_version BEFORE INSERT ON your_schema_name.prompt_configuration FOR EACH ROW EXECUTE FUNCTION your_schema_name.set_prompt_configuration_version();


--
-- Name: ai_job_queue fk_ai_job_queue_prompt_suggestion_response; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_job_queue
    ADD CONSTRAINT fk_ai_job_queue_prompt_suggestion_response FOREIGN KEY (prompt_suggestion_response_id) REFERENCES your_schema_name.prompt_suggestion_response(prompt_suggestion_response_id) ON DELETE SET NULL;


--
-- Name: ai_job_queue fk_aijobqueue_airesponse; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_job_queue
    ADD CONSTRAINT fk_aijobqueue_airesponse FOREIGN KEY (ai_response_id) REFERENCES your_schema_name.ai_response(ai_response_id);


--
-- Name: ai_job_queue fk_aijobqueue_job_status; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_job_queue
    ADD CONSTRAINT fk_aijobqueue_job_status FOREIGN KEY (job_status_ind_code, job_status) REFERENCES your_schema_name.code_values(code_type_code, value) DEFERRABLE;


--
-- Name: ai_job_queue fk_aijobqueue_job_type; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_job_queue
    ADD CONSTRAINT fk_aijobqueue_job_type FOREIGN KEY (job_type_ind_code, job_type) REFERENCES your_schema_name.code_values(code_type_code, value);


--
-- Name: ai_response fk_airesponse_cases; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response
    ADD CONSTRAINT fk_airesponse_cases FOREIGN KEY (case_id) REFERENCES your_schema_name.cases(case_id);


--
-- Name: ai_response fk_airesponse_promptconfiguration; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response
    ADD CONSTRAINT fk_airesponse_promptconfiguration FOREIGN KEY (prompt_configuration_id) REFERENCES your_schema_name.prompt_configuration(prompt_configuration_id);


--
-- Name: ai_response fk_airesponse_status; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response
    ADD CONSTRAINT fk_airesponse_status FOREIGN KEY (ai_status_ind_code, ai_status) REFERENCES your_schema_name.code_values(code_type_code, value);


--
-- Name: ai_response_document fk_airesponsedocument_airesponse; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response_document
    ADD CONSTRAINT fk_airesponsedocument_airesponse FOREIGN KEY (ai_response_id) REFERENCES your_schema_name.ai_response(ai_response_id);


--
-- Name: ai_response_document fk_airesponsedocument_casedocuments; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.ai_response_document
    ADD CONSTRAINT fk_airesponsedocument_casedocuments FOREIGN KEY (document_id) REFERENCES your_schema_name.case_documents(document_id);


--
-- Name: case_documents fk_casedocuments_cases; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.case_documents
    ADD CONSTRAINT fk_casedocuments_cases FOREIGN KEY (case_id) REFERENCES your_schema_name.cases(case_id);


--
-- Name: case_documents fk_casedocuments_submitted_by; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.case_documents
    ADD CONSTRAINT fk_casedocuments_submitted_by FOREIGN KEY (submitted_by_ind_code, submitted_by) REFERENCES your_schema_name.code_values(code_type_code, value);


--
-- Name: code_values fk_code_values_code_type; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.code_values
    ADD CONSTRAINT fk_code_values_code_type FOREIGN KEY (code_type_code) REFERENCES your_schema_name.code_types(code_type_code);


--
-- Name: document_vision_extractions fk_documentvisionextractions_document; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.document_vision_extractions
    ADD CONSTRAINT fk_documentvisionextractions_document FOREIGN KEY (document_id) REFERENCES your_schema_name.case_documents(document_id);


--
-- Name: document_vision_extractions fk_documentvisionextractions_promptconfiguration; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.document_vision_extractions
    ADD CONSTRAINT fk_documentvisionextractions_promptconfiguration FOREIGN KEY (prompt_configuration_id) REFERENCES your_schema_name.prompt_configuration(prompt_configuration_id);


--
-- Name: prompt_suggestion_response fk_prompt_suggestion_response_prompt_configuration; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompt_suggestion_response
    ADD CONSTRAINT fk_prompt_suggestion_response_prompt_configuration FOREIGN KEY (prompt_configuration_id) REFERENCES your_schema_name.prompt_configuration(prompt_configuration_id) ON DELETE RESTRICT;


--
-- Name: prompt_configuration fk_promptconfiguration_model; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompt_configuration
    ADD CONSTRAINT fk_promptconfiguration_model FOREIGN KEY (ai_model_ind_code, ai_model_name) REFERENCES your_schema_name.code_values(code_type_code, value);


--
-- Name: prompt_configuration fk_promptconfiguration_prompts; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompt_configuration
    ADD CONSTRAINT fk_promptconfiguration_prompts FOREIGN KEY (prompt_id) REFERENCES your_schema_name.prompts(prompt_id);


--
-- Name: prompt_configuration fk_promptconfiguration_reasoning; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name.prompt_configuration
    ADD CONSTRAINT fk_promptconfiguration_reasoning FOREIGN KEY (reasoning_effort_ind_code, reasoning_effort) REFERENCES your_schema_name.code_values(code_type_code, value);


--
-- Name: user fk_user_role_code_values; Type: FK CONSTRAINT; Schema: your_schema_name; Owner: -
--

ALTER TABLE ONLY your_schema_name."user"
    ADD CONSTRAINT fk_user_role_code_values FOREIGN KEY (role_ind_code, role_code) REFERENCES your_schema_name.code_values(code_type_code, value);


--
-- PostgreSQL database dump complete
--

