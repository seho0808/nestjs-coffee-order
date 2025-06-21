import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../user/user.entity';
import { Menu } from '../menu/menu.entity';
import { Order } from '../order/order.entity';
import { OrderItem } from '../order/order-item.entity';
import { PointTransaction } from '../payment/point-transaction.entity';

export default registerAs(
  'database',
  (): TypeOrmModuleOptions => ({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434', 10),
    username: process.env.DB_USERNAME || 'coffee_user',
    password: process.env.DB_PASSWORD || 'coffee_password',
    database: process.env.DB_DATABASE || 'coffee_order',
    entities: [User, Menu, Order, OrderItem, PointTransaction],
    synchronize: false,
    logging: true,
  }),
);
