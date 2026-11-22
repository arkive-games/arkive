# Login and Account

Public profile publication, trust progression and review feedback follow the
[content-moderation specification](../ARKIVE_CONTENT_MODERATION_SPEC.yaml).
That policy does not turn private account settings into public review content.

- Keep existing login-dialog rules and behavior.
- Account menu: remove visible UID only; retain other content/actions. Account
  identifiers and their use on other surfaces are unchanged.
- Personal/account center: retain left navigation + right content. Remove the
  right pane's redundant current-page title and introductory description.
- Edit Profile begins with editing controls rather than a repeated Edit Profile
  heading and explanation. Keep actual nickname/biography fields, labels,
  validation, and actions. Apply the same concise pattern to other account
  sections while retaining meaningful semantic page/navigation identification.

## Content moderation workspace

The protected account-menu entrance is Content moderation, with the shared
shield-check icon. Retain the former image-review deep link as a route into
historical image records.

Reuse the encyclopedia's quiet directory and wide-data content frame. The
directory separates pending submissions, decision history, reports and appeals;
site administrators also have global trust management. Publication rules remain
readable in the same workspace. On existing narrow layouts, keep every permitted
section reachable through the shared selector without horizontal overflow.

Start the content pane with shared type filters and permitted-game selection.
Filter before server pagination. Use compact rows and the shared detail dialog,
with complete submitted text, structured public fields, all media, author
eligibility and the previous public revision when relevant. Decision history is
read-only. Reports and appeals have separate open/resolved filters and retain
their decision reasons. Private review state must disappear on account changes
or permission denial.

The detail form distinguishes correction requests from explicit violation
findings. Required reasons, evidence, qualification exclusions, restoration and
media readiness follow the publication-policy owner above. Do not represent a
legacy per-image write as approval of a complete submission. An unconnected
workflow has an explicit availability state; it is never an empty-queue result.
