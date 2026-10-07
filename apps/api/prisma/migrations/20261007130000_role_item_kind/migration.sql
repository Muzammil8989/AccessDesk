-- Template and checklist items that assign a role are no longer called "realm" roles: the word is
-- specific to one identity provider. Renaming the enum value keeps every existing row, which
-- simply reads ROLE instead of REALM_ROLE.
ALTER TYPE "ItemKind" RENAME VALUE 'REALM_ROLE' TO 'ROLE';
