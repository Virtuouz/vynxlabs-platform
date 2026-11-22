-- Phase 25 (decision 0006): apps and dashboards are one page model, and nothing made before it is
-- read or upgraded. A member's dashboards, who they are shared with, and the queries the widgets
-- of deployed pages named are cleared; the pages themselves are written again from the examples.
delete from dashboard_share;
delete from member_dashboard;
delete from dashboard_widget_query;
