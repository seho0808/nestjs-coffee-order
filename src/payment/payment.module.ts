import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointTransaction } from './point-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PointTransaction])],
  controllers: [],
  providers: [],
  exports: [TypeOrmModule],
})
export class PaymentModule {}
