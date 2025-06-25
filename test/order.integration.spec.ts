import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { User } from '../src/user/user.entity';
import { Menu } from '../src/menu/menu.entity';
import { Order } from '../src/order/order.entity';
import { OrderItem } from '../src/order/order-item.entity';
import {
  PointTransaction,
  PointTransactionType,
} from '../src/payment/point-transaction.entity';
import { OrderService } from '../src/order/order.service';
import { PaymentService } from '../src/payment/payment.service';
import { OrderModule } from '../src/order/order.module';
import { PaymentModule } from '../src/payment/payment.module';
import { UserModule } from '../src/user/user.module';
import { MenuModule } from '../src/menu/menu.module';
import {
  initializeTransactionalContext,
  addTransactionalDataSource,
} from 'typeorm-transactional';
import { v4 as uuidv4 } from 'uuid';

describe('OrderService (통합 테스트)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let menuRepository: Repository<Menu>;
  let orderRepository: Repository<Order>;
  let orderItemRepository: Repository<OrderItem>;
  let pointTransactionRepository: Repository<PointTransaction>;
  let orderService: OrderService;
  let paymentService: PaymentService;

  // 테스트 데이터
  let testUser: User;
  let testMenus: Menu[];

  beforeAll(async () => {
    initializeTransactionalContext();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env.local', '.env'],
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.TEST_DB_HOST || 'localhost',
          port: parseInt(process.env.TEST_DB_PORT || '5434', 10),
          username: process.env.TEST_DB_USERNAME || 'coffee_user',
          password: process.env.TEST_DB_PASSWORD || 'coffee_password',
          database: process.env.TEST_DB_DATABASE || 'coffee_order',
          entities: [User, Menu, Order, OrderItem, PointTransaction],
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          User,
          Menu,
          Order,
          OrderItem,
          PointTransaction,
        ]),
        OrderModule,
        PaymentModule,
        UserModule,
        MenuModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    addTransactionalDataSource(dataSource);

    userRepository = dataSource.getRepository(User);
    menuRepository = dataSource.getRepository(Menu);
    orderRepository = dataSource.getRepository(Order);
    orderItemRepository = dataSource.getRepository(OrderItem);
    pointTransactionRepository = dataSource.getRepository(PointTransaction);
    orderService = moduleFixture.get<OrderService>(OrderService);
    paymentService = moduleFixture.get<PaymentService>(PaymentService);
  });

  afterAll(async () => {
    try {
      await cleanupTestData();
      console.log('테스트 데이터 정리 완료');

      if (dataSource && dataSource.isInitialized) {
        await dataSource.destroy();
      }
      console.log('데이터베이스 연결 종료 완료');

      if (app) {
        await app.close();
      }
      console.log('NestJS 앱 종료 완료');
    } catch (error) {
      console.error('정리 중 오류 발생:', error);
    }
  });

  beforeEach(async () => {
    await cleanupTestData();

    // 테스트 사용자 생성
    testUser = userRepository.create({
      email: 'test@example.com',
      password: 'hashedpassword',
      name: 'Test User',
      point: 100000, // 충분한 포인트 제공 (더 많이)
    });
    testUser = await userRepository.save(testUser);

    // 테스트 메뉴 생성
    testMenus = await menuRepository.save([
      menuRepository.create({
        name: '아메리카노',
        price: 3000,
      }),
      menuRepository.create({
        name: '라떼',
        price: 4000,
      }),
      menuRepository.create({
        name: '에스프레소',
        price: 2500,
      }),
    ]);
  });

  async function cleanupTestData() {
    try {
      await orderItemRepository.createQueryBuilder().delete().execute();
      await orderRepository.createQueryBuilder().delete().execute();
      await pointTransactionRepository.createQueryBuilder().delete().execute();
      await menuRepository.createQueryBuilder().delete().execute();
      await userRepository.createQueryBuilder().delete().execute();
    } catch (error) {
      console.warn('데이터 정리 중 일부 오류 발생:', error.message);
    }
  }

  describe('주문 생성 기본 기능', () => {
    it('단일 메뉴 주문이 정상적으로 생성되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 2,
        },
      ];

      const order = await orderService.createOrder(testUser.id, orderItems);

      expect(order).toBeDefined();
      expect(order.userId).toBe(testUser.id);
      expect(order.totalPrice).toBe(testMenus[0].price * 2); // 3000 * 2 = 6000
      expect(order.orderItems).toHaveLength(1);
      expect(order.orderItems[0].menuId).toBe(testMenus[0].id);
      expect(order.orderItems[0].quantity).toBe(2);
      expect(order.orderItems[0].unitPrice).toBe(testMenus[0].price);
      expect(order.orderItems[0].totalPrice).toBe(testMenus[0].price * 2);

      // 포인트가 차감되었는지 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(testUser.point - order.totalPrice);

      // 포인트 트랜잭션이 생성되었는지 확인
      const pointTransaction = await pointTransactionRepository.findOne({
        where: { userId: testUser.id, type: PointTransactionType.DEDUCT },
      });
      expect(pointTransaction).toBeDefined();
      expect(pointTransaction?.amount).toBe(order.totalPrice);
    });

    it('복수 메뉴 주문이 정상적으로 생성되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id, // 아메리카노 3000원
          quantity: 1,
        },
        {
          menuId: testMenus[1].id, // 라떼 4000원
          quantity: 2,
        },
        {
          menuId: testMenus[2].id, // 에스프레소 2500원
          quantity: 1,
        },
      ];

      const expectedTotal = 3000 + 4000 * 2 + 2500; // 13500원

      const order = await orderService.createOrder(testUser.id, orderItems);

      expect(order).toBeDefined();
      expect(order.totalPrice).toBe(expectedTotal);
      expect(order.orderItems).toHaveLength(3);

      // 각 주문 항목 검증
      const americanoItem = order.orderItems.find(
        (item) => item.menuId === testMenus[0].id,
      );
      expect(americanoItem?.quantity).toBe(1);
      expect(americanoItem?.totalPrice).toBe(3000);

      const latteItem = order.orderItems.find(
        (item) => item.menuId === testMenus[1].id,
      );
      expect(latteItem?.quantity).toBe(2);
      expect(latteItem?.totalPrice).toBe(8000);

      // 포인트 차감 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(testUser.point - expectedTotal);
    });

    it('존재하지 않는 메뉴로 주문 시 NotFoundException이 발생해야 함', async () => {
      const orderItems = [
        {
          menuId: uuidv4(), // 존재하지 않는 메뉴 ID
          quantity: 1,
        },
      ];

      await expect(
        orderService.createOrder(testUser.id, orderItems),
      ).rejects.toThrow('Some menus not found');

      // 포인트가 차감되지 않았는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(testUser.point);

      // 주문이 생성되지 않았는지 확인
      const orders = await orderRepository.find({
        where: { userId: testUser.id },
      });
      expect(orders).toHaveLength(0);
    });

    it('포인트 부족 시 주문이 실패해야 함', async () => {
      // 포인트를 부족하게 설정
      testUser.point = 1000;
      await userRepository.save(testUser);

      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 10, // 3000 * 10 = 30000원 (보유 포인트보다 많음)
        },
      ];

      await expect(
        orderService.createOrder(testUser.id, orderItems),
      ).rejects.toThrow('Insufficient points');

      // 포인트가 변경되지 않았는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(1000);

      // 주문이 생성되지 않았는지 확인
      const orders = await orderRepository.find({
        where: { userId: testUser.id },
      });
      expect(orders).toHaveLength(0);
    });
  });

  describe('트랜잭션 무결성', () => {
    it('주문 저장 실패 시 포인트 차감이 롤백되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 1,
        },
      ];

      // 주문 저장을 실패하도록 모킹
      const originalSave = orderRepository.save.bind(orderRepository);
      jest
        .spyOn(orderRepository, 'save')
        .mockRejectedValueOnce(new Error('Database error'));

      const initialPoints = testUser.point;

      await expect(
        orderService.createOrder(testUser.id, orderItems),
      ).rejects.toThrow('Database error');

      // 포인트가 롤백되었는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(initialPoints);

      // 포인트 트랜잭션도 롤백되었는지 확인
      const pointTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(pointTransactions).toHaveLength(0);

      // 주문이 생성되지 않았는지 확인
      const orders = await orderRepository.find({
        where: { userId: testUser.id },
      });
      expect(orders).toHaveLength(0);

      // 모킹 복원
      orderRepository.save = originalSave;
    });

    it('주문 항목 저장 실패 시 전체 트랜잭션이 롤백되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 1,
        },
      ];

      // 주문 항목 저장을 실패하도록 모킹
      const originalSave = orderItemRepository.save.bind(orderItemRepository);
      jest
        .spyOn(orderItemRepository, 'save')
        .mockRejectedValueOnce(new Error('OrderItem save error'));

      const initialPoints = testUser.point;

      await expect(
        orderService.createOrder(testUser.id, orderItems),
      ).rejects.toThrow('OrderItem save error');

      // 모든 데이터가 롤백되었는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(initialPoints);

      const orders = await orderRepository.find({
        where: { userId: testUser.id },
      });
      expect(orders).toHaveLength(0);

      const orderItems_saved = await orderItemRepository.find();
      expect(orderItems_saved).toHaveLength(0);

      // 모킹 복원
      orderItemRepository.save = originalSave;
    });
  });

  describe('동시성 처리', () => {
    it('동시 주문 요청이 정상적으로 처리되어야 함', async () => {
      // 충분한 포인트 설정
      testUser.point = 50000;
      await userRepository.save(testUser);

      const orderItems = [
        {
          menuId: testMenus[0].id, // 3000원
          quantity: 1,
        },
      ];

      const concurrentRequests = 5;
      const expectedTotalCost = 3000 * concurrentRequests;

      // 동시 주문 요청
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => orderService.createOrder(testUser.id, orderItems));

      const orders = await Promise.all(promises);

      // 모든 주문이 성공했는지 확인
      expect(orders).toHaveLength(concurrentRequests);
      orders.forEach((order) => {
        expect(order.totalPrice).toBe(3000);
        expect(order.orderItems).toHaveLength(1);
      });

      // 최종 포인트 확인
      const finalUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(finalUser?.point).toBe(50000 - expectedTotalCost);

      // 포인트 트랜잭션 수 확인
      const pointTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id, type: PointTransactionType.DEDUCT },
      });
      expect(pointTransactions).toHaveLength(concurrentRequests);

      // 주문 수 확인
      const savedOrders = await orderRepository.find({
        where: { userId: testUser.id },
      });
      expect(savedOrders).toHaveLength(concurrentRequests);
    });

    it('포인트 부족 상황에서 동시 주문 시 일부만 성공해야 함', async () => {
      // 3번의 주문만 가능한 포인트 설정
      testUser.point = 9000; // 3000 * 3 = 9000
      await userRepository.save(testUser);

      const orderItems = [
        {
          menuId: testMenus[0].id, // 3000원
          quantity: 1,
        },
      ];

      const concurrentRequests = 5; // 5번 요청하지만 3번만 성공해야 함

      // 동시 주문 요청
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() =>
          orderService.createOrder(testUser.id, orderItems).catch((e) => e),
        );

      const results = await Promise.all(promises);

      // 성공한 주문과 실패한 요청 구분
      const successfulOrders = results.filter(
        (result) => result instanceof Object && result.id,
      );
      const failedRequests = results.filter(
        (result) => result instanceof Error,
      );

      // 3번만 성공해야 함
      expect(successfulOrders).toHaveLength(3);
      expect(failedRequests).toHaveLength(2);

      // 최종 포인트는 0이어야 함
      const finalUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(finalUser?.point).toBe(0);

      // 성공한 주문만 저장되어야 함
      const savedOrders = await orderRepository.find({
        where: { userId: testUser.id },
      });
      expect(savedOrders).toHaveLength(3);
    });
  });

  describe('데이터 검증', () => {
    it('주문 총액이 정확하게 계산되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id, // 아메리카노 3000원
          quantity: 3,
        },
        {
          menuId: testMenus[1].id, // 라떼 4000원
          quantity: 2,
        },
      ];

      const expectedTotal = 3000 * 3 + 4000 * 2; // 17000원

      const order = await orderService.createOrder(testUser.id, orderItems);

      expect(order.totalPrice).toBe(expectedTotal);

      // 각 주문 항목의 계산도 정확한지 확인
      const americanoItem = order.orderItems.find(
        (item) => item.menuId === testMenus[0].id,
      );
      expect(americanoItem?.unitPrice).toBe(3000);
      expect(americanoItem?.totalPrice).toBe(9000);

      const latteItem = order.orderItems.find(
        (item) => item.menuId === testMenus[1].id,
      );
      expect(latteItem?.unitPrice).toBe(4000);
      expect(latteItem?.totalPrice).toBe(8000);
    });

    it('주문 항목이 데이터베이스에 정확하게 저장되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 2,
        },
        {
          menuId: testMenus[1].id,
          quantity: 1,
        },
      ];

      const order = await orderService.createOrder(testUser.id, orderItems);

      // 데이터베이스에서 직접 조회하여 확인
      const savedOrderItems = await orderItemRepository.find({
        where: { orderId: order.id },
        relations: ['menu'],
      });

      expect(savedOrderItems).toHaveLength(2);

      const americanoItem = savedOrderItems.find(
        (item) => item.menuId === testMenus[0].id,
      );
      expect(americanoItem?.quantity).toBe(2);
      expect(americanoItem?.unitPrice).toBe(3000);
      expect(americanoItem?.totalPrice).toBe(6000);

      const latteItem = savedOrderItems.find(
        (item) => item.menuId === testMenus[1].id,
      );
      expect(latteItem?.quantity).toBe(1);
      expect(latteItem?.unitPrice).toBe(4000);
      expect(latteItem?.totalPrice).toBe(4000);
    });
  });

  describe('에지 케이스', () => {
    it('수량이 0인 주문 항목 처리', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 0, // 수량 0
        },
      ];

      const order = await orderService.createOrder(testUser.id, orderItems);

      expect(order.totalPrice).toBe(0);
      expect(order.orderItems[0].quantity).toBe(0);
      expect(order.orderItems[0].totalPrice).toBe(0);

      // 포인트가 차감되지 않았는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(testUser.point);
    });

    it('매우 큰 수량의 주문 처리', async () => {
      // 충분한 포인트 설정
      testUser.point = 1000000;
      await userRepository.save(testUser);

      const orderItems = [
        {
          menuId: testMenus[0].id,
          quantity: 100, // 큰 수량
        },
      ];

      const expectedTotal = 3000 * 100; // 300000원

      const order = await orderService.createOrder(testUser.id, orderItems);

      expect(order.totalPrice).toBe(expectedTotal);
      expect(order.orderItems[0].quantity).toBe(100);
      expect(order.orderItems[0].totalPrice).toBe(expectedTotal);

      // 포인트 차감 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(1000000 - expectedTotal);
    });

    it('동일한 메뉴의 중복 주문 항목이 합쳐져서 처리되어야 함', async () => {
      const orderItems = [
        {
          menuId: testMenus[0].id, // 같은 메뉴
          quantity: 2,
        },
        {
          menuId: testMenus[0].id, // 같은 메뉴
          quantity: 3,
        },
      ];

      // 동일한 메뉴 ID는 수량이 합쳐져서 하나의 주문 항목으로 처리됨
      const order = await orderService.createOrder(testUser.id, orderItems);

      expect(order.orderItems).toHaveLength(1); // 하나의 주문 항목으로 합쳐짐
      expect(order.totalPrice).toBe(3000 * (2 + 3)); // 15000원

      const mergedItem = order.orderItems[0];
      expect(mergedItem.menuId).toBe(testMenus[0].id);
      expect(mergedItem.quantity).toBe(5); // 2 + 3 = 5
      expect(mergedItem.unitPrice).toBe(3000);
      expect(mergedItem.totalPrice).toBe(15000); // 3000 * 5
    });
  });
});
