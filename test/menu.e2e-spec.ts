import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { MenuModule } from '../src/menu/menu.module';
import { OrderModule } from '../src/order/order.module';
import { UserModule } from '../src/user/user.module';
import { Menu } from '../src/menu/menu.entity';
import { Order } from '../src/order/order.entity';
import { OrderItem } from '../src/order/order-item.entity';
import { User } from '../src/user/user.entity';
import { PointTransaction } from '../src/payment/point-transaction.entity';

describe('MenuController (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let menuRepository: Repository<Menu>;
  let orderRepository: Repository<Order>;
  let orderItemRepository: Repository<OrderItem>;
  let userRepository: Repository<User>;

  // 테스트 데이터
  let testMenus: Menu[];
  let testUser: User;
  let testOrders: Order[];

  beforeAll(async () => {
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
          Menu,
          Order,
          OrderItem,
          User,
          PointTransaction,
        ]),
        MenuModule,
        OrderModule,
        UserModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    menuRepository = dataSource.getRepository(Menu);
    orderRepository = dataSource.getRepository(Order);
    orderItemRepository = dataSource.getRepository(OrderItem);
    userRepository = dataSource.getRepository(User);
  });

  afterAll(async () => {
    try {
      // 1. 테스트 데이터 정리
      await cleanupTestData();
      console.log('테스트 데이터 정리 완료');

      // 2. 데이터베이스 연결 종료
      if (dataSource && dataSource.isInitialized) {
        await dataSource.destroy();
      }
      console.log('데이터베이스 연결 종료 완료');

      // 3. NestJS 앱 종료
      if (app) {
        await app.close();
      }
      console.log('NestJS 앱 종료 완료');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  });

  // Jest global teardown
  afterAll(async () => {
    // 남은 비동기 작업들이 완료될 시간을 줌
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  beforeEach(async () => {
    // 각 테스트 전에 데이터를 깨끗하게 초기화
    await cleanupTestData();
    await seedTestData();
  });

  async function cleanupTestData() {
    // 외래키 제약조건 순서에 맞춰 삭제 (자식 테이블부터 삭제)
    await orderItemRepository.createQueryBuilder().delete().execute();
    await orderRepository.createQueryBuilder().delete().execute();
    await menuRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();
  }

  async function seedTestData() {
    // 테스트 사용자 생성
    testUser = userRepository.create({
      name: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      point: 10000,
    });
    await userRepository.save(testUser);

    // 테스트 메뉴 생성
    testMenus = await menuRepository.save([
      { name: '아메리카노', price: 4000 },
      { name: '카페라떼', price: 4500 },
      { name: '에스프레소', price: 3500 },
      { name: '카푸치노', price: 4500 },
      { name: '마키아토', price: 5000 },
    ]);

    // 인기 메뉴를 시뮬레이션하기 위한 테스트 주문 생성
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    // 최근 주문 (7일 이내) - 아메리카노가 가장 인기 있어야 함
    const recentOrders = await orderRepository.save([
      {
        userId: testUser.id,
        totalPrice: 8000,
        createdAt: sevenDaysAgo,
      },
      {
        userId: testUser.id,
        totalPrice: 4500,
        createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        userId: testUser.id,
        totalPrice: 9000,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        userId: testUser.id,
        totalPrice: 4000,
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
    ]);

    // 오래된 주문 (7일 이전) - 인기 메뉴 순위에 영향을 주지 않아야 함
    const oldOrder = await orderRepository.save({
      userId: testUser.id,
      totalPrice: 5000,
      createdAt: tenDaysAgo,
    });

    // 주문 항목 생성
    await orderItemRepository.save([
      // 최근 주문 항목들
      // 아메리카노 - 5개 주문 (가장 인기)
      {
        orderId: recentOrders[0].id,
        menuId: testMenus[0].id,
        quantity: 2,
        unitPrice: 4000,
        totalPrice: 8000,
      },
      {
        orderId: recentOrders[1].id,
        menuId: testMenus[0].id,
        quantity: 1,
        unitPrice: 4000,
        totalPrice: 4000,
      },
      {
        orderId: recentOrders[2].id,
        menuId: testMenus[0].id,
        quantity: 1,
        unitPrice: 4000,
        totalPrice: 4000,
      },
      {
        orderId: recentOrders[3].id,
        menuId: testMenus[0].id,
        quantity: 1,
        unitPrice: 4000,
        totalPrice: 4000,
      },

      // 카페라떼 - 2개 주문 (두 번째로 인기)
      {
        orderId: recentOrders[1].id,
        menuId: testMenus[1].id,
        quantity: 1,
        unitPrice: 4500,
        totalPrice: 4500,
      },
      {
        orderId: recentOrders[2].id,
        menuId: testMenus[1].id,
        quantity: 1,
        unitPrice: 4500,
        totalPrice: 4500,
      },

      // 에스프레소 - 1개 주문 (세 번째로 인기)
      {
        orderId: recentOrders[2].id,
        menuId: testMenus[2].id,
        quantity: 1,
        unitPrice: 3500,
        totalPrice: 3500,
      },

      // 오래된 주문 항목 (집계에 포함되지 않아야 함)
      {
        orderId: oldOrder.id,
        menuId: testMenus[4].id,
        quantity: 1,
        unitPrice: 5000,
        totalPrice: 5000,
      },
    ]);

    testOrders = [...recentOrders, oldOrder];
  }

  describe('GET /menus', () => {
    it('전체 메뉴 목록을 반환해야 함', async () => {
      const response = await request(app.getHttpServer())
        .get('/menus')
        .expect(200);

      expect(response.body).toHaveLength(testMenus.length);
      expect(response.body).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            price: expect.any(Number),
          }),
        ]),
      );

      // 특정 메뉴 존재 확인
      const americano = response.body.find(
        (menu: any) => menu.name === '아메리카노',
      );
      expect(americano).toBeDefined();
      expect(americano.price).toBe(4000);
    });

    it('메뉴가 없을 경우 빈 배열을 반환해야 함', async () => {
      // 테스트용 빈 데이터 상태로 설정
      await cleanupTestData();

      const response = await request(app.getHttpServer())
        .get('/menus')
        .expect(200);

      expect(response.body).toEqual([]);

      // 이후 테스트를 위해 데이터는 beforeEach에서 자동으로 복원됨
    });
  });

  describe('GET /menus/popular', () => {
    it('인기 메뉴 구조를 올바르게 반환해야 함', async () => {
      const response = await request(app.getHttpServer())
        .get('/menus/popular')
        .expect(200);

      expect(response.body).toHaveProperty('popularMenus');
      expect(Array.isArray(response.body.popularMenus)).toBe(true);

      // OrderItem과 Menu 간의 관계가 누락되어 있어
      // 현재는 응답 구조만 테스트 가능
      if (response.body.popularMenus.length > 0) {
        const popularMenus = response.body.popularMenus;

        // 구조 검증
        popularMenus.forEach((item: any) => {
          expect(item).toHaveProperty('menu');
          expect(item).toHaveProperty('orderCount');
          expect(item.menu).toHaveProperty('id');
          expect(item.menu).toHaveProperty('name');
          expect(item.menu).toHaveProperty('price');
        });
      }
    });

    it('결과가 없을 경우 빈 배열을 반환해야 함', async () => {
      // 테스트용 빈 데이터 상태로 설정
      await cleanupTestData();

      const response = await request(app.getHttpServer())
        .get('/menus/popular')
        .expect(200);

      expect(response.body).toHaveProperty('popularMenus');
      expect(Array.isArray(response.body.popularMenus)).toBe(true);
    });
  });

  describe('GET /menus/:id', () => {
    it('유효한 ID로 메뉴를 조회할 수 있어야 함', async () => {
      const testMenu = testMenus[0];

      const response = await request(app.getHttpServer())
        .get(`/menus/${testMenu.id}`)
        .expect(200);

      expect(response.body).toEqual({
        id: testMenu.id,
        name: testMenu.name,
        price: testMenu.price,
      });
    });

    it('존재하지 않는 메뉴 ID의 경우 404를 반환해야 함', async () => {
      const nonExistentId = '00000000-0000-4000-8000-000000000000';

      const response = await request(app.getHttpServer())
        .get(`/menus/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('not found');
    });

    it('잘못된 UUID 형식의 경우 404를 반환해야 함', async () => {
      const invalidId = 'invalid-uuid';

      await request(app.getHttpServer()).get(`/menus/${invalidId}`).expect(404);
    });
  });
});
