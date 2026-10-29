-- Header bounds for raster previews. Full decode/re-encoding occurs in the browser;
-- this is not a malware scanner. No SVG, HTML or PDF inline preview.
create function auth_dv.portfolio_image_size(b bytea,m text) returns jsonb language plpgsql immutable
set search_path=pg_catalog,pg_temp as $$
declare n integer:=octet_length(b); w bigint; h bigint; i integer:=2; marker integer; sz integer;
begin
 if m='image/png' and n>=33 and substring(b from 1 for 8)=decode('89504e470d0a1a0a','hex') and substring(b from 13 for 4)=decode('49484452','hex') then
  w:=get_byte(b,16)::bigint*16777216+get_byte(b,17)*65536+get_byte(b,18)*256+get_byte(b,19);
  h:=get_byte(b,20)::bigint*16777216+get_byte(b,21)*65536+get_byte(b,22)*256+get_byte(b,23);
 elsif m='image/jpeg' and n>=4 and substring(b from 1 for 2)=decode('ffd8','hex') then
  while i<n-3 loop
   if get_byte(b,i)<>255 then exit;end if;
   while i<n and get_byte(b,i)=255 loop i:=i+1;end loop;
   if i>=n then exit;end if;marker:=get_byte(b,i);i:=i+1;
   if marker in (217,218) then exit;end if;
   if marker=1 or marker between 208 and 215 then continue;end if;
   if i+1>=n then exit;end if;sz:=get_byte(b,i)*256+get_byte(b,i+1);
   if sz<2 or i+sz>n then exit;end if;
   if marker in (192,193,194) and sz>=8 then h:=get_byte(b,i+3)*256+get_byte(b,i+4);w:=get_byte(b,i+5)*256+get_byte(b,i+6);exit;end if;
   i:=i+sz;
  end loop;
 end if;
 if w is null or h is null or w<1 or h<1 or w>4096 or h>4096 or w*h>8388608 then raise exception 'PROFILE_IMAGE_INVALID' using errcode='22023';end if;
 return jsonb_build_object('width',w,'height',h);
end $$;
revoke all on function auth_dv.portfolio_image_size(bytea,text) from public,anon,authenticated;
