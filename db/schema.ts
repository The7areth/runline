import {sqliteTable,text,integer,index} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),body:text('body').notNull(),created:text('created').notNull()},t=>[index('records_owner_kind').on(t.owner,t.kind)]);
export const files=sqliteTable('files',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull(),type:text('type').notNull(),size:integer('size').notNull()},t=>[index('files_owner').on(t.owner)]);
