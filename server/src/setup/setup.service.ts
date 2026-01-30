import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProjectConfig } from '../entities';

@Injectable()
export class SetupService {
  constructor(
    @InjectRepository(ProjectConfig)
    private configRepository: Repository<ProjectConfig>,
    private dataSource: DataSource,
  ) {}

  async saveConfig(config: Record<string, any>) {
    if (!config || typeof config !== 'object') throw new BadRequestException('Config object is required');

    const results = [];
    for (const [key, value] of Object.entries(config)) {
      const existing = await this.configRepository.findOne({ where: { key } });
      if (existing) {
        const updated = await this.configRepository.save({ id: existing.id, value: JSON.stringify(value), updatedAt: new Date() });
        results.push(updated);
      } else {
        const inserted = await this.configRepository.save({ key, value: JSON.stringify(value) });
        results.push(inserted);
      }
    }
    return { success: true, config: results, message: 'Configuration saved successfully' };
  }

  async getConfig() {
    const configs = await this.configRepository.find();
    const configObject: Record<string, any> = {};
    for (const config of configs) {
      try {
        configObject[config.key] = JSON.parse(config.value);
      } catch (e) {
        configObject[config.key] = config.value;
      }
    }
    return { config: configObject };
  }

  async getStatus() {
    const setupCompleted = await this.configRepository.findOne({ where: { key: 'setup_completed' } });
    return {
      setupCompleted: setupCompleted?.value === 'true',
      setupCompletedAt: setupCompleted?.updatedAt || null,
    };
  }
}
