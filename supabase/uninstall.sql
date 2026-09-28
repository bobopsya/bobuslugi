-- Удаляет схему Бобуслуг из базы (все данные сайта будут потеряны).
-- Нужен, если миграция применилась частично и её надо накатить заново.
drop trigger if exists on_auth_user_created on auth.users;
drop schema if exists private cascade;
drop table if exists public.audit_log, public.notifications, public.wanted, public.votes, public.candidates,
  public.elections, public.news, public.transactions, public.fines, public.documents, public.applications,
  public.services, public.app_settings, public.profiles, public.countries cascade;
drop function if exists public.is_superadmin, public.is_staff_of, public.is_president_of, public.is_any_staff,
  public.check_signup, public.invite_required, public.update_profile, public.submit_application,
  public.update_application, public.cancel_application, public.review_application, public.revoke_document,
  public.grant_coins, public.issue_fine, public.pay_fine, public.cancel_fine, public.post_news, public.delete_news,
  public.create_election, public.add_candidate, public.remove_candidate, public.set_election_status, public.vote,
  public.election_results, public.election_turnout, public.wanted_create, public.wanted_set_active, public.debtors,
  public.mark_notifications_read, public.admin_set_role, public.president_set_official, public.admin_set_banned,
  public.admin_set_country, public.admin_set_setting, public.admin_update_service cascade;
drop type if exists public.user_role, public.app_status, public.doc_type, public.fine_kind, public.fine_status,
  public.tx_type, public.news_kind, public.election_status, public.target_mode cascade;
