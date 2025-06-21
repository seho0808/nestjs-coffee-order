import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Menu } from './menu.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Menu])],
  controllers: [],
  providers: [],
  exports: [TypeOrmModule],
})
export class MenuModule {}
