CREATE TRIGGER "app_audit_log_no_truncate"
BEFORE TRUNCATE ON "app_audit_log"
FOR EACH STATEMENT EXECUTE FUNCTION "app_audit_log_reject_change"();
