-- Existing houses are already configured. Only newly created private draft
-- houses require the create/join choice in the new client. Old RPCs remain valid.
ALTER TABLE public."Households" ADD COLUMN IF NOT EXISTS "SetupCompleted" boolean NOT NULL DEFAULT true;

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
  INSERT INTO public."Households" ("Name","OwnerId","MonthlyBudget","SetupCompleted") VALUES (house_name,me."Id",30000,false) RETURNING "Id" INTO hid;
  UPDATE public."Users" SET "HouseholdId"=hid WHERE "Id"=me."Id";
 END IF;
 RETURN me."Id";
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
  'household',jsonb_build_object('id',h."Id",'name',h."Name",'ownerId',h."OwnerId",'budgetCents',(h."MonthlyBudget"*100)::bigint,'setupComplete',h."SetupCompleted"),
  'revision',revision,
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u."Id",'name',u."Username") ORDER BY u."Id") FROM public."Users" u WHERE u."HouseholdId"=h."Id" AND u."EmailConfirmed"),'[]'::jsonb),
  'expenses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e."Id",'name',e."Title",'cents',(e."TotalAmount"*100)::bigint,'category',e."Category",'payer',e."PayerId",'date',to_char(e."OccurredAt" AT TIME ZONE 'UTC','YYYY-MM-DD'),
    'split',coalesce((SELECT jsonb_agg(p."UserId" ORDER BY p."Id") FROM public."ExpenseParticipants" p WHERE p."ExpenseId"=e."Id"),'[]'::jsonb),
    'receiptPath',e."ReceiptStoragePath",'hasReceipt',e."ReceiptContentType" IS NOT NULL) ORDER BY e."Id") FROM public."Expenses" e WHERE e."HouseholdId"=h."Id"),'[]'::jsonb),
  'payments',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p."Id",'from',p."FromUserId",'to',p."ToUserId",'cents',p."Cents",'month',p."Month") ORDER BY p."Id") FROM public."Payments" p WHERE p."HouseholdId"=h."Id"),'[]'::jsonb));
END $fn$;

CREATE OR REPLACE FUNCTION softhome_private.setup_house(name text,budget_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE mid integer:=softhome_private.actor(); hid integer; h public."Households"%ROWTYPE;
BEGIN
 SELECT "HouseholdId" INTO hid FROM public."Users" WHERE "Id"=mid;
 SELECT * INTO h FROM public."Households" WHERE "Id"=hid FOR UPDATE;
 IF h."OwnerId" IS DISTINCT FROM mid THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Bu evi yalnızca kuran kişi düzenleyebilir.';
 END IF;
 IF h."SetupCompleted" THEN
  IF h."Name"=trim(name) AND (h."MonthlyBudget"*100)::bigint=budget_cents THEN RETURN; END IF;
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Evin zaten hazır. Değişiklikler için profilindeki ev ayarlarını kullan.';
 END IF;
 PERFORM softhome_private.update_house(name,budget_cents);
 UPDATE public."Households" SET "SetupCompleted"=true WHERE "Id"=hid;
END $fn$;
REVOKE ALL ON FUNCTION softhome_private.setup_house(text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION softhome_private.setup_house(text,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.softhome_setup_house(name text,budget_cents bigint)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS 'SELECT softhome_private.setup_house(name,budget_cents)';
REVOKE ALL ON FUNCTION public.softhome_setup_house(text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.softhome_setup_house(text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
