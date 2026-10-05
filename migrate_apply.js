const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,database:'firmware_custom',user:'postgres',password:'postgre'});
async function go(){
  try{
    await p.query("ALTER TABLE work_order_items ALTER COLUMN work_order_group_id DROP NOT NULL");
    await p.query("ALTER TABLE work_order_items DROP CONSTRAINT IF EXISTS work_order_items_work_order_group_id_item_number_key");
    await p.query("ALTER TABLE work_order_items DROP CONSTRAINT IF EXISTS work_order_items_work_order_group_id_fkey");
    await p.query("ALTER TABLE work_order_items ADD CONSTRAINT work_order_items_work_order_group_id_fkey FOREIGN KEY (work_order_group_id) REFERENCES work_order_groups(id) ON DELETE SET NULL");
    const r1=await p.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='work_order_items' AND column_name='work_order_group_id'");
    const r2=await p.query("SELECT conname,confdeltype FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE t.relname='work_order_items' AND c.conname='work_order_items_work_order_group_id_fkey'");
    console.log(r1.rows[0].is_nullable+','+r2.rows[0].confdeltype);
    process.exit(0);
  }catch(e){console.error('err');process.exit(1);}
}
go();