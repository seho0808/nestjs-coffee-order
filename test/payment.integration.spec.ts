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
import { PaymentService } from '../src/payment/payment.service';
import { PaymentModule } from '../src/payment/payment.module';
import { UserModule } from '../src/user/user.module';
import {
  initializeTransactionalContext,
  addTransactionalDataSource,
} from 'typeorm-transactional';
import { v4 as uuidv4 } from 'uuid';

describe('PaymentService (통합 테스트)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let pointTransactionRepository: Repository<PointTransaction>;
  let paymentService: PaymentService;

  // 테스트 데이터
  let testUser: User;

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
        PaymentModule,
        UserModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    addTransactionalDataSource(dataSource);

    userRepository = dataSource.getRepository(User);
    pointTransactionRepository = dataSource.getRepository(PointTransaction);
    paymentService = moduleFixture.get<PaymentService>(PaymentService);
  });

  afterAll(async () => {
    try {
      // 테스트 데이터 정리
      await cleanupTestData();
      console.log('테스트 데이터 정리 완료');

      // 데이터베이스 연결 종료
      if (dataSource && dataSource.isInitialized) {
        await dataSource.destroy();
      }
      console.log('데이터베이스 연결 종료 완료');

      // NestJS 앱 종료
      if (app) {
        await app.close();
      }
      console.log('NestJS 앱 종료 완료');
    } catch (error) {
      console.error('정리 중 오류 발생:', error);
    }
  });

  beforeEach(async () => {
    // 각 테스트 전 데이터 정리
    await cleanupTestData();

    // 테스트 사용자 생성
    testUser = userRepository.create({
      email: 'test@example.com',
      password: 'hashedpassword',
      name: 'Test User',
      point: 1000, // 초기 포인트 1000점
    });
    testUser = await userRepository.save(testUser);
  });

  async function cleanupTestData() {
    // 외래 키 제약 조건을 고려하여 순서대로 삭제
    await pointTransactionRepository.createQueryBuilder().delete().execute();
    await userRepository.createQueryBuilder().delete().execute();
  }

  describe('포인트 충전 기본 기능', () => {
    it('사용자에게 포인트가 정상적으로 충전되어야 함', async () => {
      const chargeAmount = 500;
      const initialPoints = testUser.point;

      const transaction = await paymentService.chargePoints(
        testUser.id,
        chargeAmount,
        uuidv4(),
      );

      // 트랜잭션 세부사항 확인
      expect(transaction).toBeDefined();
      expect(transaction.userId).toBe(testUser.id);
      expect(transaction.amount).toBe(chargeAmount);
      expect(transaction.type).toBe(PointTransactionType.ADD);

      // 사용자의 업데이트된 포인트 잔액 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(initialPoints + chargeAmount);

      // 트랜잭션이 데이터베이스에 저장되었는지 확인
      const savedTransaction = await pointTransactionRepository.findOne({
        where: { id: transaction.id },
      });
      expect(savedTransaction).toBeDefined();
      expect(savedTransaction?.amount).toBe(chargeAmount);
      expect(savedTransaction?.type).toBe(PointTransactionType.ADD);
    });

    it('존재하지 않는 사용자에 대해 NotFoundException이 발생해야 함', async () => {
      const nonExistentUserId = 'non-existent-id';
      const chargeAmount = 500;

      await expect(
        paymentService.chargePoints(nonExistentUserId, chargeAmount),
      ).rejects.toThrow('User not found');
    });
  });

  describe('포인트 차감 기본 기능', () => {
    it('사용자의 포인트가 정상적으로 차감되어야 함', async () => {
      const deductAmount = 300;
      const initialPoints = testUser.point;

      const transaction = await paymentService.deductPoints(
        testUser.id,
        deductAmount,
      );

      // 트랜잭션 세부사항 확인
      expect(transaction).toBeDefined();
      expect(transaction.userId).toBe(testUser.id);
      expect(transaction.amount).toBe(deductAmount);
      expect(transaction.type).toBe(PointTransactionType.DEDUCT);

      // 사용자의 업데이트된 포인트 잔액 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(initialPoints - deductAmount);

      // 트랜잭션이 데이터베이스에 저장되었는지 확인
      const savedTransaction = await pointTransactionRepository.findOne({
        where: { id: transaction.id },
      });
      expect(savedTransaction).toBeDefined();
      expect(savedTransaction?.amount).toBe(deductAmount);
      expect(savedTransaction?.type).toBe(PointTransactionType.DEDUCT);
    });

    it('포인트가 부족할 경우 에러가 발생해야 함', async () => {
      const deductAmount = testUser.point + 100; // 보유량보다 많은 금액

      await expect(
        paymentService.deductPoints(testUser.id, deductAmount),
      ).rejects.toThrow('Insufficient points');

      // 사용자의 포인트가 변경되지 않았는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(testUser.point);

      // 트랜잭션이 생성되지 않았는지 확인
      const transactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(transactions).toHaveLength(0);
    });

    it('존재하지 않는 사용자에 대해 NotFoundException이 발생해야 함', async () => {
      const nonExistentUserId = 'non-existent-id';
      const deductAmount = 300;

      await expect(
        paymentService.deductPoints(nonExistentUserId, deductAmount),
      ).rejects.toThrow('User not found');
    });

    it('보유 포인트 전액 차감이 정상적으로 처리되어야 함', async () => {
      const deductAmount = testUser.point; // 정확한 보유량만큼

      const transaction = await paymentService.deductPoints(
        testUser.id,
        deductAmount,
      );

      // 트랜잭션 세부사항 확인
      expect(transaction).toBeDefined();
      expect(transaction.amount).toBe(deductAmount);
      expect(transaction.type).toBe(PointTransactionType.DEDUCT);

      // 사용자의 포인트가 0이 되었는지 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(0);
    });
  });

  describe('포인트 충전 동시성 처리', () => {
    it('동시 충전 요청이 정상적으로 처리되어야 함', async () => {
      const chargeAmount = 100;
      const initialPoints = testUser.point;
      const concurrentRequests = 10;

      // 동시 충전 요청 시뮬레이션
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => paymentService.chargePoints(testUser.id, chargeAmount));

      const transactions = await Promise.all(promises);

      // 모든 트랜잭션이 생성되었는지 확인
      expect(transactions).toHaveLength(concurrentRequests);
      transactions.forEach((transaction) => {
        expect(transaction.amount).toBe(chargeAmount);
        expect(transaction.type).toBe(PointTransactionType.ADD);
      });

      // 최종 사용자 잔액 확인
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(
        initialPoints + chargeAmount * concurrentRequests,
      );

      // 모든 트랜잭션이 저장되었는지 확인
      const savedTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(savedTransactions).toHaveLength(concurrentRequests);
    });

    it('대량 동시 충전 요청도 정확하게 처리되어야 함', async () => {
      const chargeAmount = 50;
      const initialPoints = testUser.point;
      const concurrentRequests = 50;

      // 대량 동시 충전 요청
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => paymentService.chargePoints(testUser.id, chargeAmount));

      const transactions = await Promise.all(promises);

      // 모든 트랜잭션이 성공했는지 확인
      expect(transactions).toHaveLength(concurrentRequests);

      // 최종 사용자 잔액 확인
      const finalPoints = await paymentService.getUserPoints(testUser.id);
      expect(finalPoints).toBe(
        initialPoints + chargeAmount * concurrentRequests,
      );

      // 트랜잭션 기록 수 확인
      const allTransactions = await paymentService.getPointTransactions(
        testUser.id,
      );
      expect(allTransactions).toHaveLength(concurrentRequests);
    });
  });

  describe('포인트 차감 동시성 처리', () => {
    it('동시 차감 요청이 정상적으로 처리되어야 함', async () => {
      // 여러 차감을 처리할 수 있는 초기 포인트 설정
      testUser.point = 2000;
      await userRepository.save(testUser);

      const deductAmount = 100;
      const initialPoints = testUser.point;
      const concurrentRequests = 10;

      // 동시 차감 요청 시뮬레이션
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() => paymentService.deductPoints(testUser.id, deductAmount));

      const transactions = await Promise.all(promises);

      // 모든 트랜잭션이 생성되었는지 확인
      expect(transactions).toHaveLength(concurrentRequests);
      transactions.forEach((transaction) => {
        expect(transaction.amount).toBe(deductAmount);
        expect(transaction.type).toBe(PointTransactionType.DEDUCT);
      });

      // 최종 사용자 잔액 확인
      const finalPoints = await paymentService.getUserPoints(testUser.id);
      expect(finalPoints).toBe(
        initialPoints - deductAmount * concurrentRequests,
      );

      // 모든 트랜잭션이 저장되었는지 확인
      const savedTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(savedTransactions).toHaveLength(concurrentRequests);
    });

    it('포인트 부족 상황에서 동시 차감 요청 시 일부만 성공해야 함', async () => {
      // 5번 차감만 가능한 포인트 설정
      testUser.point = 500;
      await userRepository.save(testUser);

      const deductAmount = 100;
      const concurrentRequests = 10; // 10번 요청하지만 5번만 성공해야 함

      // 동시 차감 요청
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() =>
          paymentService
            .deductPoints(testUser.id, deductAmount)
            .catch((e) => e),
        );

      const results = await Promise.all(promises);

      // 성공한 트랜잭션과 실패한 요청 구분
      const successfulTransactions = results.filter(
        (result) => result instanceof Object && result.id,
      );
      const failedRequests = results.filter(
        (result) => result instanceof Error,
      );

      // 5번만 성공해야 함
      expect(successfulTransactions).toHaveLength(5);
      expect(failedRequests).toHaveLength(5);

      // 최종 포인트는 0이어야 함
      const finalPoints = await paymentService.getUserPoints(testUser.id);
      expect(finalPoints).toBe(0);

      // 성공한 트랜잭션만 저장되어야 함
      const savedTransactions = await paymentService.getPointTransactions(
        testUser.id,
      );
      expect(savedTransactions).toHaveLength(5);
    });
  });

  describe('혼합 동시성 처리', () => {
    it('충전과 차감 요청이 동시에 발생해도 정확하게 처리되어야 함', async () => {
      const initialPoints = testUser.point;
      const chargeAmount = 200;
      const deductAmount = 150;
      const operationsCount = 10;

      // 충전과 차감 요청을 번갈아가며 생성
      const promises: Promise<any>[] = [];
      for (let i = 0; i < operationsCount; i++) {
        if (i % 2 === 0) {
          promises.push(paymentService.chargePoints(testUser.id, chargeAmount));
        } else {
          promises.push(
            paymentService
              .deductPoints(testUser.id, deductAmount)
              .catch((e) => e),
          );
        }
      }

      const results = await Promise.all(promises);

      // 성공한 연산 개수 계산
      const successfulCharges = results.filter(
        (result, index) =>
          index % 2 === 0 && result instanceof Object && result.id,
      ).length;
      const successfulDeductions = results.filter(
        (result, index) =>
          index % 2 === 1 && result instanceof Object && result.id,
      ).length;

      // 최종 포인트 계산 및 확인
      const expectedFinalPoints =
        initialPoints +
        successfulCharges * chargeAmount -
        successfulDeductions * deductAmount;

      const finalPoints = await paymentService.getUserPoints(testUser.id);
      expect(finalPoints).toBe(expectedFinalPoints);

      // 트랜잭션 기록 확인
      const allTransactions = await paymentService.getPointTransactions(
        testUser.id,
      );
      expect(allTransactions).toHaveLength(
        successfulCharges + successfulDeductions,
      );
    });
  });

  describe('트랜잭션 무결성 및 오류 처리', () => {
    it('충전 작업 실패 시 데이터 무결성이 유지되어야 함', async () => {
      // 실패를 시뮬레이션하기 위한 저장소 모킹
      jest
        .spyOn(userRepository, 'save')
        .mockRejectedValueOnce(new Error('Database error'));

      const initialPoints = testUser.point;
      const chargeAmount = 500;

      await expect(
        paymentService.chargePoints(testUser.id, chargeAmount),
      ).rejects.toThrow('Database error');

      // 사용자 포인트가 변경되지 않았는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(initialPoints);

      // 트랜잭션이 생성되지 않았는지 확인
      const transactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(transactions).toHaveLength(0);
    });

    it('차감 작업 실패 시 데이터 무결성이 유지되어야 함', async () => {
      // 실패를 시뮬레이션하기 위한 저장소 모킹
      jest
        .spyOn(userRepository, 'save')
        .mockRejectedValueOnce(new Error('Database error'));

      const initialPoints = testUser.point;
      const deductAmount = 300;

      await expect(
        paymentService.deductPoints(testUser.id, deductAmount),
      ).rejects.toThrow('Database error');

      // 사용자 포인트가 변경되지 않았는지 확인
      const unchangedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(unchangedUser?.point).toBe(initialPoints);

      // 트랜잭션이 생성되지 않았는지 확인
      const transactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(transactions).toHaveLength(0);
    });
  });

  describe('포인트 조회 및 히스토리 관리', () => {
    it('사용자의 현재 포인트를 정확하게 조회할 수 있어야 함', async () => {
      const points = await paymentService.getUserPoints(testUser.id);
      expect(points).toBe(testUser.point);
    });

    it('존재하지 않는 사용자 포인트 조회 시 NotFoundException이 발생해야 함', async () => {
      const nonExistentUserId = 'non-existent-id';

      await expect(
        paymentService.getUserPoints(nonExistentUserId),
      ).rejects.toThrow('User not found');
    });

    it('포인트 트랜잭션 히스토리를 시간순으로 조회할 수 있어야 함', async () => {
      // 트랜잭션 생성 (시간 간격을 두고)
      await paymentService.chargePoints(testUser.id, 100);
      await new Promise((resolve) => setTimeout(resolve, 10)); // 짧은 대기
      await paymentService.deductPoints(testUser.id, 50);
      await new Promise((resolve) => setTimeout(resolve, 10)); // 짧은 대기
      await paymentService.chargePoints(testUser.id, 200);

      const transactions = await paymentService.getPointTransactions(
        testUser.id,
      );

      expect(transactions).toHaveLength(3);
      // 최신순으로 정렬되어야 함
      expect(transactions[0].type).toBe(PointTransactionType.ADD);
      expect(transactions[0].amount).toBe(200);
      expect(transactions[1].type).toBe(PointTransactionType.DEDUCT);
      expect(transactions[1].amount).toBe(50);
      expect(transactions[2].type).toBe(PointTransactionType.ADD);
      expect(transactions[2].amount).toBe(100);
    });

    it('존재하지 않는 사용자의 트랜잭션 히스토리 조회 시 NotFoundException이 발생해야 함', async () => {
      const nonExistentUserId = 'non-existent-id';

      await expect(
        paymentService.getPointTransactions(nonExistentUserId),
      ).rejects.toThrow('User not found');
    });

    it('트랜잭션이 없는 사용자도 빈 배열을 반환해야 함', async () => {
      const transactions = await paymentService.getPointTransactions(
        testUser.id,
      );

      expect(transactions).toHaveLength(0);
      expect(Array.isArray(transactions)).toBe(true);
    });
  });

  describe('idempotency 기능 테스트', () => {
    it('동일한 idempotency key로 충전 요청 시 중복 처리되지 않아야 함', async () => {
      const chargeAmount = 500;
      const idempotencyKey = uuidv4();
      const initialPoints = testUser.point;

      // 동일한 idempotency key로 두 번 요청
      const transaction1 = await paymentService.chargePoints(
        testUser.id,
        chargeAmount,
        idempotencyKey,
      );
      const transaction2 = await paymentService.chargePoints(
        testUser.id,
        chargeAmount,
        idempotencyKey,
      );

      // 두 번째 요청은 첫 번째와 동일한 트랜잭션을 반환해야 함
      expect(transaction1.id).toBe(transaction2.id);
      expect(transaction1.amount).toBe(chargeAmount);
      expect(transaction1.type).toBe(PointTransactionType.ADD);

      // 사용자 포인트는 한 번만 증가해야 함
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(initialPoints + chargeAmount);

      // 데이터베이스에는 하나의 트랜잭션만 저장되어야 함
      const savedTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id, idempotencyKey },
      });
      expect(savedTransactions).toHaveLength(1);
    });

    it('동일한 idempotency key로 차감 요청 시 중복 처리되지 않아야 함', async () => {
      const deductAmount = 300;
      const idempotencyKey = uuidv4();
      const initialPoints = testUser.point;

      // 동일한 idempotency key로 두 번 요청
      const transaction1 = await paymentService.deductPoints(
        testUser.id,
        deductAmount,
        idempotencyKey,
      );
      const transaction2 = await paymentService.deductPoints(
        testUser.id,
        deductAmount,
        idempotencyKey,
      );

      // 두 번째 요청은 첫 번째와 동일한 트랜잭션을 반환해야 함
      expect(transaction1.id).toBe(transaction2.id);
      expect(transaction1.amount).toBe(deductAmount);
      expect(transaction1.type).toBe(PointTransactionType.DEDUCT);

      // 사용자 포인트는 한 번만 차감되어야 함
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(initialPoints - deductAmount);

      // 데이터베이스에는 하나의 트랜잭션만 저장되어야 함
      const savedTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id, idempotencyKey },
      });
      expect(savedTransactions).toHaveLength(1);
    });

    it('다른 idempotency key로 요청 시 별도 트랜잭션이 생성되어야 함', async () => {
      const chargeAmount = 200;
      const idempotencyKey1 = uuidv4();
      const idempotencyKey2 = uuidv4();
      const initialPoints = testUser.point;

      // 다른 idempotency key로 두 번 요청
      const transaction1 = await paymentService.chargePoints(
        testUser.id,
        chargeAmount,
        idempotencyKey1,
      );
      const transaction2 = await paymentService.chargePoints(
        testUser.id,
        chargeAmount,
        idempotencyKey2,
      );

      // 서로 다른 트랜잭션이어야 함
      expect(transaction1.id).not.toBe(transaction2.id);
      expect(transaction1.idempotencyKey).toBe(idempotencyKey1);
      expect(transaction2.idempotencyKey).toBe(idempotencyKey2);

      // 사용자 포인트는 두 번 증가해야 함
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(initialPoints + chargeAmount * 2);

      // 데이터베이스에는 두 개의 트랜잭션이 저장되어야 함
      const savedTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id },
      });
      expect(savedTransactions).toHaveLength(2);
    });

    it('동시에 동일한 idempotency key로 요청해도 중복 처리되지 않아야 함', async () => {
      const chargeAmount = 100;
      const idempotencyKey = uuidv4();
      const initialPoints = testUser.point;
      const concurrentRequests = 5;

      // 동일한 idempotency key로 동시 요청
      const promises = Array(concurrentRequests)
        .fill(null)
        .map(() =>
          paymentService.chargePoints(
            testUser.id,
            chargeAmount,
            idempotencyKey,
          ),
        );

      const results = await Promise.all(promises);

      // 모든 결과가 동일한 트랜잭션이어야 함
      const firstTransactionId = results[0].id;
      results.forEach((result) => {
        expect(result.id).toBe(firstTransactionId);
        expect(result.idempotencyKey).toBe(idempotencyKey);
      });

      // 사용자 포인트는 한 번만 증가해야 함
      const updatedUser = await userRepository.findOne({
        where: { id: testUser.id },
      });
      expect(updatedUser?.point).toBe(initialPoints + chargeAmount);

      // 데이터베이스에는 하나의 트랜잭션만 저장되어야 함
      const savedTransactions = await pointTransactionRepository.find({
        where: { userId: testUser.id, idempotencyKey },
      });
      expect(savedTransactions).toHaveLength(1);
    });
  });
});
