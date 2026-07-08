/** Uniqueness constraints for every node label's `id` field. Safe to run repeatedly. */
export const SCHEMA_CONSTRAINTS: string[] = [
  "CREATE CONSTRAINT submission_id IF NOT EXISTS FOR (n:Submission) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT issue_theme_id IF NOT EXISTS FOR (n:IssueTheme) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT project_option_id IF NOT EXISTS FOR (n:ProjectOption) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT location_id IF NOT EXISTS FOR (n:Location) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT sector_id IF NOT EXISTS FOR (n:Sector) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT public_indicator_id IF NOT EXISTS FOR (n:PublicIndicator) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT scheme_rule_id IF NOT EXISTS FOR (n:SchemeRule) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT sanctioned_work_id IF NOT EXISTS FOR (n:SanctionedWork) REQUIRE n.id IS UNIQUE",
  "CREATE CONSTRAINT constituency_id IF NOT EXISTS FOR (n:Constituency) REQUIRE n.id IS UNIQUE",
];
