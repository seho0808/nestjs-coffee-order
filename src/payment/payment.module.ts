import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PointTransaction } from './point-transaction.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { User } from '../user/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PointTransaction, User])],
  controllers: [PaymentController],
  providers: [PaymentService],
  exports: [PaymentService, TypeOrmModule],
})
export class PaymentModule {}
