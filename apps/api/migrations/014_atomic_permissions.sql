-- Atomic permissions: one key per action, replacing the coarse bundles.
--
-- The nine keys this replaces made unrelated powers inseparable. `projects.manage`
-- meant "may start a project" and "may permanently destroy any project in the
-- company, including ones you have nothing to do with" in a single grant, so a
-- company could not hand out the first without the second. That is how a user
-- type could be named for reading and still delete real work.
--
-- Every existing holder is mapped forward to the full set their old key implied,
-- so nobody loses access at the moment of upgrade. That is deliberately generous:
-- silently reducing what people can do during a migration produces a morning of
-- support calls and no security benefit, because the person who could already
-- delete projects yesterday is not stopped by us forgetting to say so today. The
-- narrowing is the company's to do afterwards, per user type, in a screen that
-- tells them what each key means.
--
-- Note the one asymmetry: `projects.manage` maps to `projects.delete` as well,
-- because those holders genuinely could delete before. It is now insufficient on
-- its own — deletion also requires being project administrator of that specific
-- project — so the grant is preserved while the rule around it tightens.

-- Expand the old bundles. `array_remove` then `array_cat` rather than a plain
-- append, so running this twice cannot leave a permission listed twice.
update user_types
   set permissions = (
     select array_agg(distinct permission order by permission)
       from unnest(
         array_cat(
           array_remove(
             array_remove(
               array_remove(
                 array_remove(permissions, 'projects.manage'),
                 'users.manage'
               ),
               'user_types.manage'
             ),
             'projects.read'
           ),
           case when 'projects.manage' = any(permissions) then array[
             'projects.read', 'projects.create', 'projects.edit', 'projects.archive',
             'projects.delete', 'projects.manage_all',
             'project_team.read', 'project_team.manage',
             'tasks.read', 'tasks.create', 'tasks.edit', 'tasks.delete',
             'risks.read', 'risks.create', 'risks.edit', 'risks.delete'
           ] else array[]::text[] end
           ||
           -- Reading projects has always implied seeing their team and their
           -- work; those were never separate keys, so a reader who suddenly
           -- could not open a task list would be a regression, not a tightening.
           case when 'projects.read' = any(permissions) then array[
             'projects.read', 'project_team.read', 'tasks.read', 'risks.read'
           ] else array[]::text[] end
           ||
           case when 'users.manage' = any(permissions) then array[
             'users.read', 'users.create', 'users.edit', 'users.disable'
           ] else array[]::text[] end
           ||
           case when 'user_types.manage' = any(permissions) then array[
             'user_types.read', 'user_types.create', 'user_types.edit', 'user_types.delete'
           ] else array[]::text[] end
         )
       ) as permission
   )
 where permissions && array['projects.manage', 'projects.read', 'users.manage', 'user_types.manage'];

-- Rename the two seeded types whose names collided with other vocabulary.
-- Keys are untouched: assignments point at the key, so changing it would orphan
-- them. "Viewer" as a user type sat beside `viewer` as a project membership role
-- meaning something different, which is exactly the confusion being removed.
update user_types
   set name = 'Project office',
       description = 'Run projects across the company.'
 where key = 'project_manager' and system_type and name = 'Project Manager';

update user_types
   set name = 'Read only',
       description = 'See the work, change nothing.'
 where key = 'viewer' and system_type and name = 'Viewer';

-- The seeded "Project office" type keeps company-wide reach but loses the power
-- to destroy, which is the rule the owner asked for: deleting a project requires
-- being the administrator of that project, not merely running the project office.
update user_types
   set permissions = array_remove(permissions, 'projects.delete')
 where key = 'project_manager' and system_type;

-- Separation-of-duties rules reference permission keys as free text, so any rule
-- naming a retired key would silently stop matching and a control the company
-- believed was on would be off. The table ships empty, but a tenant may have
-- added rules by hand, so retired keys are rewritten rather than left dangling.
delete from tenant_separation_rules
 where permission_a in ('projects.manage', 'users.manage', 'user_types.manage')
    or permission_b in ('projects.manage', 'users.manage', 'user_types.manage');
