-- Private household API for the bundled Android application.
-- Existing records remain intact. Auth verification is always server-side.
ALTER TABLE public."Users" ADD COLUMN IF NOT EXISTS "AuthUserId" uuid;
ALTER TABLE public."Expenses" ADD COLUMN IF NOT EXISTS "ReceiptStoragePath" text;
CREATE UNIQUE INDEX IF NOT EXISTS "IX_Users_AuthUserId" ON public."Users" ("AuthUserId");
DO $fk$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='FK_Users_Auth_AuthUserId') THEN
  ALTER TABLE public."Users" ADD CONSTRAINT "FK_Users_Auth_AuthUserId" FOREIGN KEY ("AuthUserId") REFERENCES auth.users(id) ON DELETE SET NULL;
 END IF;
END $fk$;
CREATE SCHEMA IF NOT EXISTS softhome_private;
REVOKE ALL ON SCHEMA softhome_private FROM PUBLIC;
GRANT USAGE ON SCHEMA softhome_private TO authenticated;

CREATE OR REPLACE FUNCTION softhome_private.identity()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid := auth.uid(); sid uuid;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Giriş yapman gerekiyor.'; END IF;
 BEGIN sid := (auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN invalid_text_representation THEN sid:=NULL; END;
 IF sid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.sessions s WHERE s.id=sid AND s.user_id=uid AND (s.not_after IS NULL OR s.not_after>now())) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Oturumun sona erdi. Tekrar giriş yap.';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id=uid AND a.email_confirmed_at IS NOT NULL) THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Önce e-posta adresini doğrula.';
 END IF;
 RETURN uid;
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.actor()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=softhome_private.identity(); account record; me public."Users"%ROWTYPE; hid integer; display_name text; house_name text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(uid::text, 0));
 SELECT * INTO me FROM public."Users" WHERE "AuthUserId"=uid;
 IF FOUND THEN RETURN me."Id"; END IF;
 SELECT email, raw_user_meta_data INTO account FROM auth.users WHERE id=uid;
 SELECT * INTO me FROM public."Users" WHERE "AuthUserId" IS NULL AND lower("Email")=lower(account.email) ORDER BY "Id" LIMIT 1 FOR UPDATE;
 IF FOUND THEN
  UPDATE public."Users" SET "AuthUserId"=uid,"NormalizedEmail"=upper(trim(account.email)),"EmailConfirmed"=true,
    "VerificationTokenHash"=NULL,"VerificationExpiresAt"=NULL,"FailedLogins"=0,"LockedUntil"=NULL WHERE "Id"=me."Id";
 ELSE
  display_name:=left(coalesce(nullif(trim(account.raw_user_meta_data->>'name'),''),'Ev arkadaşı'),80);
  INSERT INTO public."Users" ("Username","Email","NormalizedEmail","PasswordHash","EmailConfirmed","FailedLogins","AuthUserId")
    VALUES (display_name,account.email,upper(trim(account.email)),'',true,0,uid) RETURNING * INTO me;
 END IF;
 IF me."HouseholdId" IS NULL THEN
  house_name:=left(coalesce(nullif(trim(account.raw_user_meta_data->>'householdName'),''),'Evim'),80);
  INSERT INTO public."Households" ("Name","OwnerId","MonthlyBudget") VALUES (house_name,me."Id",30000) RETURNING "Id" INTO hid;
  UPDATE public."Users" SET "HouseholdId"=hid WHERE "Id"=me."Id";
 END IF;
 RETURN me."Id";
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.current_household()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE uid uuid:=softhome_private.identity(); hid integer;
BEGIN SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "AuthUserId"=uid AND "EmailConfirmed"; RETURN hid; END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.activity(actor integer, message text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $fn$
 INSERT INTO public."HouseholdActivities" ("HouseholdId","ActorId","Message","CreatedAt")
 SELECT "HouseholdId","Id","Username"||' '||message,now() FROM public."Users" WHERE "Id"=actor;
$fn$;

CREATE OR REPLACE FUNCTION softhome_private.attach_legacy(hid integer, actor integer)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
DECLARE n integer;
BEGIN
 UPDATE public."Expenses" e SET "HouseholdId"=hid
 WHERE e."HouseholdId" IS NULL AND EXISTS(SELECT 1 FROM public."Users" p WHERE p."Id"=e."PayerId" AND p."HouseholdId"=hid AND p."EmailConfirmed")
 AND EXISTS(SELECT 1 FROM public."ExpenseParticipants" p WHERE p."ExpenseId"=e."Id")
 AND NOT EXISTS(SELECT 1 FROM public."ExpenseParticipants" p JOIN public."Users" u ON u."Id"=p."UserId" WHERE p."ExpenseId"=e."Id" AND (u."HouseholdId" IS DISTINCT FROM hid OR NOT u."EmailConfirmed"));
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN PERFORM softhome_private.activity(actor,'eski ev kayıtlarını aynı eve bağladı.'); END IF;
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.workspace()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); me public."Users"%ROWTYPE; h public."Households"%ROWTYPE; revision integer;
BEGIN
 SELECT * INTO me FROM public."Users" WHERE "Id"=mid;
 SELECT coalesce(max("Id"),0) INTO revision FROM public."HouseholdActivities" WHERE "HouseholdId"=me."HouseholdId";
 SELECT * INTO h FROM public."Households" WHERE "Id"=me."HouseholdId";
 RETURN jsonb_build_object(
  'me',jsonb_build_object('id',mid,'name',me."Username",'email',me."Email"),
  'household',jsonb_build_object('id',h."Id",'name',h."Name",'ownerId',h."OwnerId",'budgetCents',(h."MonthlyBudget"*100)::bigint),
  'revision',revision,
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u."Id",'name',u."Username") ORDER BY u."Id") FROM public."Users" u WHERE u."HouseholdId"=h."Id" AND u."EmailConfirmed"),'[]'::jsonb),
  'expenses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e."Id",'name',e."Title",'cents',(e."TotalAmount"*100)::bigint,'category',e."Category",'payer',e."PayerId",'date',to_char(e."OccurredAt" AT TIME ZONE 'UTC','YYYY-MM-DD'),
    'split',coalesce((SELECT jsonb_agg(p."UserId" ORDER BY p."Id") FROM public."ExpenseParticipants" p WHERE p."ExpenseId"=e."Id"),'[]'::jsonb),
    'receiptPath',e."ReceiptStoragePath",'hasReceipt',e."ReceiptContentType" IS NOT NULL) ORDER BY e."Id") FROM public."Expenses" e WHERE e."HouseholdId"=h."Id"),'[]'::jsonb),
  'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p."Id",'from',p."FromUserId",'to',p."ToUserId",'cents',p."Cents",'month',p."Month") ORDER BY p."Id") FROM public."Payments" p WHERE p."HouseholdId"=h."Id"),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.notifications()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; last_id integer; read_id integer;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT coalesce(max("Id"),0) INTO last_id FROM public."HouseholdActivities" WHERE "HouseholdId"=hid;
 SELECT coalesce((SELECT "LastReadId" FROM public."NotificationReadStates" WHERE "UserId"=mid AND "HouseholdId"=hid),0) INTO read_id;
 RETURN jsonb_build_object('householdId',hid,'latestId',last_id,
  'unreadCount',(SELECT count(*) FROM public."HouseholdActivities" WHERE "HouseholdId"=hid AND "ActorId"<>mid AND "Id">read_id AND "Id"<=last_id),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a."Id",'message',a."Message",'createdAt',a."CreatedAt",'unread',a."Id">read_id) ORDER BY a."Id" DESC)
    FROM (SELECT * FROM public."HouseholdActivities" WHERE "HouseholdId"=hid AND "ActorId"<>mid AND "Id"<=last_id ORDER BY "Id" DESC LIMIT 50) a),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.mark_read(through_id integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; last_id integer;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT coalesce(max("Id"),0) INTO last_id FROM public."HouseholdActivities" WHERE "HouseholdId"=hid;
 IF through_id IS NULL OR through_id<0 OR through_id>last_id THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Geçerli bildirimleri seç.'; END IF;
 INSERT INTO public."NotificationReadStates" ("UserId","HouseholdId","LastReadId") VALUES (mid,hid,through_id)
 ON CONFLICT ("UserId","HouseholdId") DO UPDATE SET "LastReadId"=greatest(public."NotificationReadStates"."LastReadId",excluded."LastReadId");
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.update_house(name text, budget_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; owner integer;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT "OwnerId" INTO owner FROM public."Households" WHERE "Id"=hid FOR UPDATE;
 IF owner IS DISTINCT FROM mid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Ev ayarlarını yalnızca ev yöneticisi değiştirebilir.'; END IF;
 IF name IS NULL OR length(trim(name)) NOT BETWEEN 1 AND 80 OR budget_cents IS NULL OR budget_cents<=0 OR budget_cents>100000000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Geçerli bir ev adı ve bütçe gir.'; END IF;
 UPDATE public."Households" SET "Name"=trim(name),"MonthlyBudget"=budget_cents/100.0 WHERE "Id"=hid;
 PERFORM softhome_private.activity(mid,'ev adını veya aylık bütçeyi güncelledi.');
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.invite()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; owner integer; code text:=upper(replace(gen_random_uuid()::text,'-','')); expiry timestamptz:=now()+interval '7 days';
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT "OwnerId" INTO owner FROM public."Households" WHERE "Id"=hid FOR UPDATE;
 IF owner IS DISTINCT FROM mid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Katılım kodunu yalnızca ev yöneticisi oluşturabilir.'; END IF;
 UPDATE public."Households" SET "InvitationHash"=encode(extensions.digest(code,'sha256'),'hex'),"InvitationExpiresAt"=expiry WHERE "Id"=hid;
 RETURN jsonb_build_object('code',code,'expiresAt',expiry);
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.join_house(code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); old_hid integer; target integer; code_hash text;
BEGIN
 IF code IS NULL OR length(trim(code)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Geçerli bir ev katılım kodu gir.'; END IF;
 code_hash:=encode(extensions.digest(upper(trim(code)),'sha256'),'hex');
 SELECT "HouseholdId" INTO old_hid FROM public."Users" WHERE "Id"=mid;
 SELECT "Id" INTO target FROM public."Households" WHERE "InvitationHash"=code_hash AND "InvitationExpiresAt">now();
 IF target IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Katılım kodu geçersiz veya süresi dolmuş.'; END IF;
 IF target=old_hid THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Zaten bu evin üyesisin.'; END IF;
 PERFORM 1 FROM public."Households" WHERE "Id" IN (target,old_hid) ORDER BY "Id" FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public."Households" WHERE "Id"=target AND "InvitationHash"=code_hash AND "InvitationExpiresAt">now()) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Katılım kodu geçersiz veya süresi dolmuş.'; END IF;
 IF EXISTS(SELECT 1 FROM public."Expenses" WHERE "HouseholdId"=old_hid) OR EXISTS(SELECT 1 FROM public."Payments" WHERE "HouseholdId"=old_hid)
    OR (SELECT count(*) FROM public."Users" WHERE "HouseholdId"=old_hid)>1 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Kayıtları veya başka üyeleri bulunan bir evden doğrudan ayrılamazsın.'; END IF;
 UPDATE public."Users" SET "HouseholdId"=target WHERE "Id"=mid;
 UPDATE public."Households" SET "InvitationHash"=NULL,"InvitationExpiresAt"=NULL,"OwnerId"=NULL WHERE "Id"=old_hid AND "OwnerId"=mid;
 PERFORM softhome_private.activity(mid,'eve katıldı.');
 PERFORM softhome_private.attach_legacy(target,mid);
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.validate_receipt(hid integer, path text, mime text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 IF path IS NULL THEN
  IF mime IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Fatura bilgileri eksik.'; END IF;
  RETURN;
 END IF;
 IF mime IS NULL OR mime NOT IN ('image/jpeg','image/png','image/webp') OR path !~ ('^'||hid::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$')
    OR NOT EXISTS(SELECT 1 FROM storage.objects o WHERE o.bucket_id='softhome-receipts' AND o.name=path) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Geçerli bir fatura fotoğrafı yükle.';
 END IF;
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.create_expense(payload jsonb, receipt_path text DEFAULT NULL, receipt_mime text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; eid integer; cents bigint; payer integer; participants integer[]; occurred date; title text; category text;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 PERFORM 1 FROM public."Households" WHERE "Id"=hid FOR UPDATE;
 cents:=(payload->>'cents')::bigint; payer:=(payload->>'payerId')::integer; title:=trim(payload->>'name'); category:=payload->>'category';
 IF jsonb_typeof(payload->'participantIds')<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Paylaşacak kişileri seç.'; END IF;
 SELECT array_agg(value::integer ORDER BY ordinality) INTO participants FROM jsonb_array_elements_text(payload->'participantIds') WITH ORDINALITY;
 IF title IS NULL OR length(title) NOT BETWEEN 1 AND 80 OR cents IS NULL OR cents<=0 OR cents>100000000 OR category IS NULL OR category NOT IN ('home','market','bill','food','internet','other')
  OR participants IS NULL OR cardinality(participants) NOT BETWEEN 1 AND 100 OR cardinality(participants)<>(SELECT count(DISTINCT x) FROM unnest(participants) x)
  OR (payload->>'date') IS NULL OR (payload->>'date') !~ '^\d{4}-\d{2}-\d{2}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Harcama açıklamasını, tutarı, tarihi ve paylaşacak kişileri kontrol et.'; END IF;
 occurred:=(payload->>'date')::date;
 IF NOT EXISTS(SELECT 1 FROM public."Users" WHERE "Id"=payer AND "HouseholdId"=hid AND "EmailConfirmed")
  OR EXISTS(SELECT 1 FROM unnest(participants) x WHERE NOT EXISTS(SELECT 1 FROM public."Users" WHERE "Id"=x AND "HouseholdId"=hid AND "EmailConfirmed")) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Yalnızca bu eve kayıtlı kişileri seçebilirsin.'; END IF;
 PERFORM softhome_private.validate_receipt(hid,receipt_path,receipt_mime);
 INSERT INTO public."Expenses" ("Title","TotalAmount","CreatedAt","OccurredAt","PayerId","CreatedById","HouseholdId","Category","ReceiptStoragePath","ReceiptContentType")
 VALUES (title,cents/100.0,now(),occurred::timestamp AT TIME ZONE 'UTC',payer,mid,hid,category,receipt_path,receipt_mime) RETURNING "Id" INTO eid;
 INSERT INTO public."ExpenseParticipants" ("ExpenseId","UserId","OwedAmount","IsPaid")
 SELECT eid,x,(cents/cardinality(participants)+CASE WHEN ordinality<=cents%cardinality(participants) THEN 1 ELSE 0 END)/100.0,false FROM unnest(participants) WITH ORDINALITY t(x,ordinality);
 PERFORM softhome_private.activity(mid,'“'||title||'” harcamasını ekledi.');
 RETURN jsonb_build_object('id',eid);
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.receipt_info(expense_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; e public."Expenses"%ROWTYPE;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT * INTO e FROM public."Expenses" WHERE "Id"=expense_id AND "HouseholdId"=hid;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Bu faturaya erişilemiyor.'; END IF;
 RETURN jsonb_build_object('path',e."ReceiptStoragePath",'data',CASE WHEN e."ReceiptStoragePath" IS NULL THEN encode(e."ReceiptData",'base64') ELSE NULL END,'mime',e."ReceiptContentType",'canEdit',e."CreatedById"=mid OR (SELECT "OwnerId"=mid FROM public."Households" WHERE "Id"=hid),'householdId',hid);
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.replace_receipt(expense_id integer, receipt_path text, receipt_mime text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 PERFORM 1 FROM public."Households" WHERE "Id"=hid FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM public."Expenses" e JOIN public."Households" h ON h."Id"=e."HouseholdId" WHERE e."Id"=expense_id AND e."HouseholdId"=hid AND (e."CreatedById"=mid OR h."OwnerId"=mid)) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Faturayı yalnızca kaydı ekleyen kişi veya ev yöneticisi değiştirebilir.'; END IF;
 PERFORM softhome_private.validate_receipt(hid,receipt_path,receipt_mime);
 UPDATE public."Expenses" SET "ReceiptStoragePath"=receipt_path,"ReceiptContentType"=receipt_mime,"ReceiptData"=NULL WHERE "Id"=expense_id;
 PERFORM softhome_private.activity(mid,'bir fatura fotoğrafını güncelledi.');
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.payment(payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; owner integer; sender integer; recipient integer; cents bigint; month text; req uuid; start_date date; end_date date; sender_net bigint; recipient_net bigint; previous public."Payments"%ROWTYPE;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT "OwnerId" INTO owner FROM public."Households" WHERE "Id"=hid FOR UPDATE;
 sender:=(payload->>'fromUserId')::integer; recipient:=(payload->>'toUserId')::integer; cents:=(payload->>'cents')::bigint; month:=payload->>'month'; req:=(payload->>'requestId')::uuid;
 IF sender IS DISTINCT FROM mid AND owner IS DISTINCT FROM mid THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Yalnızca kendi ödemen veya ev yöneticisinin kaydı kabul edilir.'; END IF;
 IF cents IS NULL OR cents<=0 OR req IS NULL OR req='00000000-0000-0000-0000-000000000000' OR month IS NULL OR month!~'^\d{4}-\d{2}$' OR sender IS NULL OR recipient IS NULL OR sender=recipient THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ödeme bilgilerini kontrol et.'; END IF;
 start_date:=(month||'-01')::date; end_date:=(start_date+interval '1 month')::date;
 IF (SELECT count(*) FROM public."Users" WHERE "Id" IN (sender,recipient) AND "HouseholdId"=hid AND "EmailConfirmed")<>2 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Ödeme yalnızca aynı evin üyeleri arasında kaydedilebilir.'; END IF;
 SELECT * INTO previous FROM public."Payments" WHERE "HouseholdId"=hid AND "RequestId"=req;
 IF FOUND THEN
  IF previous."FromUserId"=sender AND previous."ToUserId"=recipient AND previous."Cents"=cents AND previous."Month"=month THEN RETURN; END IF;
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bu ödeme isteğinin bilgileri değişmiş. Tekrar kontrol et.';
 END IF;
 WITH deltas AS (
  SELECT e."PayerId" AS uid,(e."TotalAmount"*100)::bigint AS delta FROM public."Expenses" e WHERE e."HouseholdId"=hid AND e."OccurredAt">=start_date AND e."OccurredAt"<end_date
  UNION ALL SELECT p."UserId",-(p."OwedAmount"*100)::bigint FROM public."ExpenseParticipants" p JOIN public."Expenses" e ON e."Id"=p."ExpenseId" WHERE e."HouseholdId"=hid AND e."OccurredAt">=start_date AND e."OccurredAt"<end_date
  UNION ALL SELECT "FromUserId","Cents" FROM public."Payments" WHERE "HouseholdId"=hid AND "Month"=month
  UNION ALL SELECT "ToUserId",-"Cents" FROM public."Payments" WHERE "HouseholdId"=hid AND "Month"=month
 ) SELECT coalesce(sum(delta) FILTER(WHERE uid=sender),0),coalesce(sum(delta) FILTER(WHERE uid=recipient),0) INTO sender_net,recipient_net FROM deltas;
 IF sender_net>=0 OR recipient_net<=0 OR cents>least(-sender_net,recipient_net) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Bakiyeler değişmiş. Güncel ödemeyi seçip tekrar dene.'; END IF;
 INSERT INTO public."Payments" ("HouseholdId","FromUserId","ToUserId","Cents","Month","RequestId","CreatedAt") VALUES (hid,sender,recipient,cents,month,req,now());
 PERFORM softhome_private.activity(mid,'bir ödeme kaydetti. Bakiyeler güncellendi.');
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.context()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); result jsonb;
BEGIN SELECT jsonb_build_object('id',"Id",'householdId',"HouseholdId") INTO result FROM public."Users" WHERE "Id"=mid; RETURN result; END $fn$;

-- Public RPC wrappers have no elevated rights. Every private entry point validates
-- auth.uid(), verified email and the live Auth session before accessing any data.
CREATE OR REPLACE FUNCTION public.softhome_context() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.context()';
CREATE OR REPLACE FUNCTION public.softhome_workspace() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.workspace()';
CREATE OR REPLACE FUNCTION public.softhome_notifications() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.notifications()';
CREATE OR REPLACE FUNCTION public.softhome_mark_read(through_id integer) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.mark_read(through_id)';
CREATE OR REPLACE FUNCTION public.softhome_update_house(name text,budget_cents bigint) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.update_house(name,budget_cents)';
CREATE OR REPLACE FUNCTION public.softhome_invite() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.invite()';
CREATE OR REPLACE FUNCTION public.softhome_join(code text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.join_house(code)';
CREATE OR REPLACE FUNCTION public.softhome_create_expense(payload jsonb,receipt_path text DEFAULT NULL,receipt_mime text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.create_expense(payload,receipt_path,receipt_mime)';
CREATE OR REPLACE FUNCTION public.softhome_receipt_info(expense_id integer) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.receipt_info(expense_id)';
CREATE OR REPLACE FUNCTION public.softhome_replace_receipt(expense_id integer,receipt_path text,receipt_mime text) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.replace_receipt(expense_id,receipt_path,receipt_mime)';
CREATE OR REPLACE FUNCTION public.softhome_payment(payload jsonb) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.payment(payload)';

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA softhome_private FROM PUBLIC,anon,authenticated;
DO $grants$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='softhome_private'
   AND p.proname IN ('context','workspace','notifications','mark_read','update_house','invite','join_house','create_expense','receipt_info','replace_receipt','payment','current_household') LOOP
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'softhome\_%' ESCAPE '\' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);
 END LOOP;
END $grants$;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('softhome-receipts','softhome-receipts',false,1048576,ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
DO $storage_policy$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='softhome_household_receipts') THEN
  CREATE POLICY softhome_household_receipts ON storage.objects FOR SELECT TO authenticated USING (
   bucket_id='softhome-receipts' AND (storage.foldername(name))[1]=softhome_private.current_household()::text
  );
 END IF;
END $storage_policy$;

CREATE OR REPLACE FUNCTION softhome_private.broadcast_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fn$
BEGIN
 PERFORM realtime.send(jsonb_build_object('revision',NEW."Id"),'changed','softhome:household:'||NEW."HouseholdId"::text,true);
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION softhome_private.broadcast_activity() FROM PUBLIC, anon, authenticated;
DO $trigger$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='softhome_activity_broadcast' AND tgrelid='public."HouseholdActivities"'::regclass) THEN
  CREATE TRIGGER softhome_activity_broadcast AFTER INSERT ON public."HouseholdActivities" FOR EACH ROW EXECUTE FUNCTION softhome_private.broadcast_activity();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='realtime' AND tablename='messages' AND policyname='softhome_household_broadcasts') THEN
  CREATE POLICY softhome_household_broadcasts ON realtime.messages FOR SELECT TO authenticated USING (
   realtime.topic()='softhome:household:'||softhome_private.current_household()::text
  );
 END IF;
END $trigger$;

NOTIFY pgrst, 'reload schema';
