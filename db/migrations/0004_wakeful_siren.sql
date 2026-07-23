CREATE TABLE "consent_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" text NOT NULL,
	"policy_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"consent_version_id" uuid NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_versions" ADD CONSTRAINT "consent_versions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_consents" ADD CONSTRAINT "employee_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_consents" ADD CONSTRAINT "employee_consents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_consents" ADD CONSTRAINT "employee_consents_consent_version_id_consent_versions_id_fk" FOREIGN KEY ("consent_version_id") REFERENCES "public"."consent_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "consent_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "consent_versions" FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "employee_consents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "employee_consents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "employee_consents" FOR ALL USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);