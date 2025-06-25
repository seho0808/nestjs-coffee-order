import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Menu } from '../menu/menu.entity';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { PaymentModule } from '../payment/payment.module';
import { PaymentService } from 'src/payment/payment.service';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Menu]), PaymentModule],
  controllers: [OrderController],
  providers: [OrderService, PaymentService],
  exports: [TypeOrmModule],
})
export class OrderModule {}
