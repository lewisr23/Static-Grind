-- Accounts and saved presets.
--
-- A preset is 19 knob values plus a colour-grade enum: a few hundred bytes.
-- No image, video or webcam frame ever reaches this database. The whole
-- rendering pipeline stays in the browser; this stores knob positions only.

create table users (
    id             uuid         primary key,
    email          text         not null,
    password_hash  text         not null,
    display_name   text         not null,
    created_at     timestamptz  not null default now()
);

-- Emails are compared case-insensitively, so uniqueness has to be too,
-- otherwise Lewis@x.com and lewis@x.com become two accounts.
create unique index users_email_key on users (lower(email));

create table presets (
    id          uuid         primary key,
    user_id     uuid         not null references users (id) on delete cascade,
    name        text         not null,
    params      jsonb        not null,
    seed        bigint,
    created_at  timestamptz  not null default now(),
    updated_at  timestamptz  not null default now()
);

-- "VHS Decay" and "vhs decay" are the same preset to a person, so they are
-- the same preset here. Saving over a name replaces rather than duplicates.
create unique index presets_user_name_key on presets (user_id, lower(name));

create index presets_user_created_idx on presets (user_id, created_at desc);
