CREATE TABLE "oss_claim_ticket" (
	"secret_hash" text NOT NULL,
	"run_id" text NOT NULL,
	"terminal_status" text NOT NULL,
	"workload_class" text NOT NULL,
	"subcommand" text NOT NULL,
	"build_profile" text NOT NULL,
	"issued_at" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"user_id" text,
	CONSTRAINT "oss_claim_ticket_secret_hash_pk" PRIMARY KEY("secret_hash"),
	CONSTRAINT "oss_claim_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE "oss_claim_rate_limit_counter" (
	"scope" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"scope_key" text NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "oss_claim_rate_limit_counter_scope_window_scope_key_pk" PRIMARY KEY("scope","window_start","scope_key")
);
--> statement-breakpoint
ALTER TABLE "funnel_event" DROP CONSTRAINT "funnel_event_event_check";
--> statement-breakpoint
ALTER TABLE "funnel_event" ADD CONSTRAINT "funnel_event_event_check" CHECK ("event" IN (
	'demo_verify_ok',
	'sign_in',
	'checkout_started',
	'subscription_checkout_completed',
	'api_key_created',
	'reserve_allowed',
	'report_share_created',
	'report_share_view',
	'acquisition_landed',
	'integrate_landed',
	'licensed_verify_outcome',
	'verify_started',
	'verify_outcome',
	'oss_claim_redeemed'
));
