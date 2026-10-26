insert into public.account(id,name,status) values
 ('10000000-0000-0000-0000-000000000001','Synthetic A','activo'),
 ('10000000-0000-0000-0000-000000000002','Synthetic B','activo'),
 ('10000000-0000-0000-0000-000000000003','Synthetic waitlist','waitlist');
insert into public.app_user(id,email,name,role,account_id,member_role,pending) values
 ('20000000-0000-0000-0000-000000000001','owner-a@synthetic.invalid','Synthetic owner A','cliente','10000000-0000-0000-0000-000000000001','owner',false),
 ('20000000-0000-0000-0000-000000000002','owner-b@synthetic.invalid','Synthetic owner B','cliente','10000000-0000-0000-0000-000000000002','owner',false),
 ('20000000-0000-0000-0000-000000000003','member-a@synthetic.invalid','Synthetic member','cliente','10000000-0000-0000-0000-000000000001','miembro',false),
 ('20000000-0000-0000-0000-000000000004','staff@synthetic.invalid','Synthetic staff','analista',null,null,false),
 ('20000000-0000-0000-0000-000000000005','admin@synthetic.invalid','Synthetic admin','admin',null,null,false),
 ('20000000-0000-0000-0000-000000000006','revoked@synthetic.invalid','Synthetic revoked','cliente','10000000-0000-0000-0000-000000000001','owner',true);
insert into public.brand(id,account_id,name) values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Synthetic brand');
insert into public.project(id,brand_id,title) values
 ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Synthetic project');
insert into public.block(id,project_id,code,title,capa,status) values
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','F1','Synthetic block','Fundación','en_revision');
insert into public.round(id,block_id,seq,title) values
 ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',1,'Synthetic revision');
insert into public.assignment(analyst_id,account_id) values
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001');
insert into public.package_access(account_id,package) values ('10000000-0000-0000-0000-000000000001','fundacion');
