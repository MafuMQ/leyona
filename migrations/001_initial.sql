CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text UNIQUE NOT NULL,
 name text NOT NULL, password_hash text NOT NULL, role text NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','bot')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, expires_at timestamptz NOT NULL);
CREATE TABLE markets (
 id text PRIMARY KEY, question text NOT NULL, description text NOT NULL,
 category text NOT NULL, icon text NOT NULL, yes_price integer NOT NULL DEFAULT 5000 CHECK(yes_price BETWEEN 1 AND 9999),
 volume bigint NOT NULL DEFAULT 0, closes_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','suspended','proposed','disputed','settled')),
 live boolean NOT NULL DEFAULT false, score text, event_group text NOT NULL,
 result text CHECK(result IN ('yes','no','void')), evidence text, challenge_until timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE accounts (
 id text PRIMARY KEY, owner_id uuid REFERENCES users, asset text NOT NULL DEFAULT 'credit',
 balance bigint NOT NULL DEFAULT 0, allow_negative boolean NOT NULL DEFAULT false,
 CHECK(allow_negative OR balance >= 0)
);
CREATE TABLE journal (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, reference text UNIQUE NOT NULL, description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE entries (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, journal_id uuid NOT NULL REFERENCES journal, account_id text NOT NULL REFERENCES accounts, amount bigint NOT NULL CHECK(amount <> 0));
CREATE INDEX entries_account ON entries(account_id);
CREATE FUNCTION check_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (SELECT a.asset FROM entries e JOIN accounts a ON a.id=e.account_id WHERE e.journal_id=NEW.journal_id GROUP BY a.asset HAVING sum(e.amount)<>0) THEN
 RAISE EXCEPTION 'Unbalanced journal'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
CREATE FUNCTION immutable_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Journal history is immutable'; END $$;
CREATE TRIGGER immutable_entries BEFORE UPDATE OR DELETE ON entries FOR EACH ROW EXECUTE FUNCTION immutable_journal();
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON journal FOR EACH ROW EXECUTE FUNCTION immutable_journal();
CREATE TABLE orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, market_id text NOT NULL REFERENCES markets,
 outcome text NOT NULL CHECK(outcome IN ('yes','no')), side text NOT NULL CHECK(side IN ('buy','sell')),
 price integer NOT NULL CHECK(price BETWEEN 1 AND 9999), quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000),
 remaining integer NOT NULL CHECK(remaining>=0), state text NOT NULL DEFAULT 'open' CHECK(state IN ('pending','open','filled','canceled')),
 tif text NOT NULL CHECK(tif IN ('GTC','GTD','FAK','FOK')), eligible_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), priority bigint GENERATED ALWAYS AS IDENTITY
);
CREATE INDEX matching_book ON orders(market_id,outcome,side,price,priority) WHERE state='open';
CREATE TABLE fills (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), market_id text NOT NULL REFERENCES markets, maker_id uuid NOT NULL REFERENCES orders, taker_id uuid NOT NULL REFERENCES orders, outcome text NOT NULL, price integer NOT NULL, quantity integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE position_stats (user_id uuid NOT NULL REFERENCES users, market_id text NOT NULL REFERENCES markets, outcome text NOT NULL, cost bigint NOT NULL DEFAULT 0, realized bigint NOT NULL DEFAULT 0, PRIMARY KEY(user_id,market_id,outcome));
CREATE TABLE commands (user_id uuid NOT NULL REFERENCES users, key text NOT NULL, fingerprint text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key));
CREATE TABLE combo_quotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users, maker_id uuid NOT NULL REFERENCES users, legs jsonb NOT NULL, stake bigint NOT NULL, payout bigint NOT NULL, expires_at timestamptz NOT NULL, accepted boolean NOT NULL DEFAULT false);
CREATE TABLE combos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), quote_id uuid UNIQUE NOT NULL REFERENCES combo_quotes, user_id uuid NOT NULL REFERENCES users, maker_id uuid NOT NULL REFERENCES users, legs jsonb NOT NULL, stake bigint NOT NULL, payout bigint NOT NULL, state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','won','lost','void','sold')), created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE cashout_quotes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), combo_id uuid NOT NULL REFERENCES combos, user_id uuid NOT NULL REFERENCES users, amount bigint NOT NULL, expires_at timestamptz NOT NULL, accepted boolean NOT NULL DEFAULT false);
CREATE TABLE disputes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), market_id text NOT NULL REFERENCES markets, user_id uuid NOT NULL REFERENCES users, evidence text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(market_id,user_id));
CREATE TABLE comments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), market_id text NOT NULL REFERENCES markets, user_id uuid NOT NULL REFERENCES users, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE watchlists (user_id uuid NOT NULL REFERENCES users, market_id text NOT NULL REFERENCES markets, PRIMARY KEY(user_id,market_id));
CREATE TABLE audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users, action text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outbox (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, topic text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE rate_limits (key text PRIMARY KEY, window_start timestamptz NOT NULL DEFAULT now(), count integer NOT NULL DEFAULT 1);
CREATE TABLE simulator_state (market_id text PRIMARY KEY REFERENCES markets, tick integer NOT NULL DEFAULT 0);
