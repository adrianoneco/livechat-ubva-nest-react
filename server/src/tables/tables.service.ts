import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TablesService {
  constructor(private dataSource: DataSource) {}

  async query(table: string, filters?: any, options?: { limit?: number; offset?: number; orderBy?: string; order?: 'ASC' | 'DESC' }) {
    const allowedTables = ['whatsapp_instances', 'whatsapp_contacts', 'whatsapp_conversations', 'whatsapp_messages', 'profiles', 'sectors', 'tickets', 'leads', 'campaigns', 'webhooks', 'api_tokens'];
    if (!allowedTables.includes(table)) throw new BadRequestException('Invalid table name');

    let sql = `SELECT * FROM ${table}`;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters && Object.keys(filters).length > 0) {
      const conditions = Object.entries(filters).map(([key, value]) => {
        params.push(value);
        return `${key} = $${paramIndex++}`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (options?.orderBy) {
      sql += ` ORDER BY ${options.orderBy} ${options.order || 'DESC'}`;
    }

    if (options?.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    if (options?.offset) {
      sql += ` OFFSET ${options.offset}`;
    }

    const result = await this.dataSource.query(sql, params);
    return result;
  }

  async insert(table: string, data: any) {
    const allowedTables = ['whatsapp_contacts', 'sectors', 'leads', 'tickets', 'webhooks'];
    if (!allowedTables.includes(table)) throw new BadRequestException('Insert not allowed for this table');

    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    const [result] = await this.dataSource.query(sql, values);
    return result;
  }

  async update(table: string, id: string, data: any) {
    const allowedTables = ['whatsapp_contacts', 'whatsapp_conversations', 'sectors', 'leads', 'tickets', 'webhooks'];
    if (!allowedTables.includes(table)) throw new BadRequestException('Update not allowed for this table');

    const keys = Object.keys(data);
    const values = Object.values(data);
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');

    values.push(id);
    const sql = `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    const [result] = await this.dataSource.query(sql, values);
    return result;
  }

  async delete(table: string, id: string) {
    const allowedTables = ['sectors', 'webhooks', 'api_tokens'];
    if (!allowedTables.includes(table)) throw new BadRequestException('Delete not allowed for this table');

    await this.dataSource.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
    return { success: true };
  }
}
