CREATE TABLE "terminal"."near_misses" (
	"venues" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"at" timestamp with time zone NOT NULL
);
