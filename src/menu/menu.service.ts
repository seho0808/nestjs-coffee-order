import { Injectable } from '@nestjs/common';
import {
  MenuResponseDto,
  PopularMenuItemDto,
  PopularMenuResponseDto,
} from './dto';
import { OrderItem } from '../order/order-item.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Menu } from './menu.entity';
import { Repository } from 'typeorm';
import { MENU_CONSTANTS } from './constants/menu.constants';
import { isValidUuid } from '../common/utils/uuid';

@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  async getAllMenus(): Promise<MenuResponseDto[]> {
    const menus = await this.menuRepository.find();
    return menus.map(
      (menu) =>
        new MenuResponseDto({
          id: menu.id,
          name: menu.name,
          price: menu.price,
        }),
    );
  }

  async getMenuById(id: string): Promise<MenuResponseDto | null> {
    if (!isValidUuid(id)) {
      throw new Error('Invalid UUID format');
    }

    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) {
      return null;
    }
    return new MenuResponseDto({
      id: menu.id,
      name: menu.name,
      price: menu.price,
    });
  }

  async getPopularMenus(): Promise<PopularMenuResponseDto> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setTime(
      sevenDaysAgo.getTime() -
        MENU_CONSTANTS.POPULAR_MENU_DAYS * 24 * 60 * 60 * 1000,
    );

    const rankingLimit = MENU_CONSTANTS.POPULAR_MENU_LIMIT;

    const popularMenus = await this.orderItemRepository
      .createQueryBuilder('orderItem')
      .leftJoin('orderItem.menu', 'menu')
      .leftJoin('orderItem.order', 'order')
      .select([
        'menu.id as menu_id',
        'menu.name as menu_name',
        'menu.price as menu_price',
        'COUNT(orderItem.id) as orderCount',
      ])
      .where('order.createdAt >= :sevenDaysAgo', { sevenDaysAgo })
      .groupBy('menu.id')
      .addGroupBy('menu.name')
      .addGroupBy('menu.price')
      .orderBy('orderCount', 'DESC')
      .limit(rankingLimit)
      .getRawMany();

    return new PopularMenuResponseDto(
      popularMenus.map(
        (data) =>
          new PopularMenuItemDto(
            new MenuResponseDto({
              id: data.menu_id,
              name: data.menu_name,
              price: data.menu_price,
            }),
            parseInt(data.orderCount),
          ),
      ),
    );
  }
}
