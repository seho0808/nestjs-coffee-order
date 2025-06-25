import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transactional } from 'typeorm-transactional';
import { Order } from './order.entity';
import { OrderItem } from './order-item.entity';
import { Menu } from '../menu/menu.entity';
import { PaymentService } from '../payment/payment.service';
import { OrderItemDto } from './dto/create-order.dto';

@Injectable()
export class OrderService {
  constructor(
    private readonly paymentService: PaymentService,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  @Transactional()
  async createOrder(userId: string, items: OrderItemDto[]): Promise<Order> {
    // 동일한 메뉴 ID의 수량을 합계 계산
    const menuQuantityMap = new Map<string, number>();
    items.forEach((item) => {
      const currentQuantity = menuQuantityMap.get(item.menuId) || 0;
      menuQuantityMap.set(item.menuId, currentQuantity + item.quantity);
    });

    // 주문할 모든 메뉴 조회 (고유한 메뉴 ID만)
    const uniqueMenuIds = Array.from(menuQuantityMap.keys());
    const menus = await this.menuRepository.findByIds(uniqueMenuIds);

    if (menus.length !== uniqueMenuIds.length) {
      throw new NotFoundException('Some menus not found');
    }

    // 총 주문 금액 계산
    let totalPrice = 0;
    const orderItems = Array.from(menuQuantityMap.entries()).map(
      ([menuId, quantity]) => {
        const menu = menus.find((m) => m.id === menuId)!;
        const itemTotalPrice = menu.price * quantity;
        totalPrice += itemTotalPrice;

        return this.orderItemRepository.create({
          menuId,
          quantity,
          unitPrice: menu.price,
          totalPrice: itemTotalPrice,
        });
      },
    );

    // 포인트 차감 (자동 생성된 멱등성 키 사용)
    await this.paymentService.deductPoints(userId, totalPrice);

    // 주문 생성
    const order = this.orderRepository.create({
      userId,
      totalPrice,
    });

    // 주문 저장
    const savedOrder = await this.orderRepository.save(order);

    // 주문 항목 저장
    const savedOrderItems = await Promise.all(
      orderItems.map((item) => {
        item.orderId = savedOrder.id;
        return this.orderItemRepository.save(item);
      }),
    );

    await this.sendOrderToMockApi(savedOrder, savedOrderItems);

    return {
      ...savedOrder,
      orderItems: savedOrderItems,
    };
  }

  private async sendOrderToMockApi(
    order: Order,
    orderItems: OrderItem[],
  ): Promise<void> {
    console.log('모의 데이터 수집 API로 주문 전송:', {
      orderId: order.id,
      userId: order.userId,
      totalPrice: order.totalPrice,
      items: orderItems.map((item) => ({
        menuId: item.menuId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
      })),
    });
  }
}
