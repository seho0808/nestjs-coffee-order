import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../src/auth/auth.module';
import { UserModule } from '../src/user/user.module';
import { User } from '../src/user/user.entity';
import { Menu } from '../src/menu/menu.entity';
import { Order } from '../src/order/order.entity';
import { OrderItem } from '../src/order/order-item.entity';
import { PointTransaction } from '../src/payment/point-transaction.entity';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let userRepository: Repository<User>;

  // 테스트 데이터
  let testUser: User;
  let accessToken: string;

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
          User,
          Menu,
          Order,
          OrderItem,
          PointTransaction,
        ]),
        AuthModule,
        UserModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // ValidationPipe 설정 (main.ts와 동일하게)
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
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
  });

  async function cleanupTestData() {
    // 외래키 제약조건 순서에 맞춰 삭제
    await userRepository.createQueryBuilder().delete().execute();
  }

  describe('POST /auth/signup', () => {
    it('유효한 정보로 회원가입이 성공해야 함', async () => {
      const signUpData = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpData)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        email: signUpData.email,
        name: signUpData.name,
        point: expect.any(Number),
      });
      expect(response.body.user).toHaveProperty('id');

      // 데이터베이스에 사용자가 생성되었는지 확인
      const savedUser = await userRepository.findOne({
        where: { email: signUpData.email },
      });
      expect(savedUser).toBeDefined();
      expect(savedUser?.name).toBe(signUpData.name);
    });

    it('중복된 이메일로 회원가입 시 에러가 발생해야 함', async () => {
      const signUpData = {
        email: 'duplicate@example.com',
        password: 'password123',
        name: 'Test User',
      };

      // 첫 번째 회원가입
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpData)
        .expect(201);

      // 같은 이메일로 두 번째 회원가입 시도
      await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpData)
        .expect(409);
    });

    it('잘못된 이메일 형식으로 회원가입 시 에러가 발생해야 함', async () => {
      const signUpData = {
        email: 'invalid-email',
        password: 'password123',
        name: 'Test User',
      };

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpData)
        .expect(400);
    });

    it('필수 필드가 누락된 경우 에러가 발생해야 함', async () => {
      const incompleteData = {
        email: 'test@example.com',
        // password와 name이 누락
      };

      await request(app.getHttpServer())
        .post('/auth/signup')
        .send(incompleteData)
        .expect(400);
    });
  });

  describe('POST /auth/signin', () => {
    beforeEach(async () => {
      // 로그인 테스트용 사용자 생성
      const signUpData = {
        email: 'signin@example.com',
        password: 'password123',
        name: 'Signin User',
      };

      await request(app.getHttpServer()).post('/auth/signup').send(signUpData);
    });

    it('유효한 자격 증명으로 로그인이 성공해야 함', async () => {
      const signInData = {
        email: 'signin@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/signin')
        .send(signInData)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(signInData.email);

      // 이후 테스트를 위해 토큰 저장
      accessToken = response.body.accessToken;
    });

    it('잘못된 비밀번호로 로그인 시 에러가 발생해야 함', async () => {
      const signInData = {
        email: 'signin@example.com',
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/auth/signin')
        .send(signInData)
        .expect(401);
    });

    it('존재하지 않는 이메일로 로그인 시 에러가 발생해야 함', async () => {
      const signInData = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/auth/signin')
        .send(signInData)
        .expect(401);
    });

    it('필수 필드가 누락된 경우 에러가 발생해야 함', async () => {
      const incompleteData = {
        email: 'signin@example.com',
        // password가 누락
      };

      await request(app.getHttpServer())
        .post('/auth/signin')
        .send(incompleteData)
        .expect(400);
    });
  });

  describe('GET /auth/profile', () => {
    beforeEach(async () => {
      // 프로필 조회 테스트용 사용자 생성 및 로그인
      const signUpData = {
        email: 'profile@example.com',
        password: 'password123',
        name: 'Profile User',
      };

      const signUpResponse = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpData);

      accessToken = signUpResponse.body.accessToken;
    });

    it('유효한 토큰으로 프로필 조회가 성공해야 함', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('email');
      expect(response.body).toHaveProperty('name');
      expect(response.body.email).toBe('profile@example.com');
      expect(response.body.name).toBe('Profile User');
    });

    it('토큰 없이 프로필 조회 시 에러가 발생해야 함', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401);
    });

    it('잘못된 토큰으로 프로필 조회 시 에러가 발생해야 함', async () => {
      await request(app.getHttpServer())
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('POST /auth/signout', () => {
    beforeEach(async () => {
      // 로그아웃 테스트용 사용자 생성 및 로그인
      const signUpData = {
        email: 'signout@example.com',
        password: 'password123',
        name: 'Signout User',
      };

      const signUpResponse = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(signUpData);

      accessToken = signUpResponse.body.accessToken;
    });

    it('유효한 토큰으로 로그아웃이 성공해야 함', async () => {
      await request(app.getHttpServer())
        .post('/auth/signout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });

    it('토큰 없이 로그아웃 시 에러가 발생해야 함', async () => {
      await request(app.getHttpServer()).post('/auth/signout').expect(401);
    });

    it('잘못된 토큰으로 로그아웃 시 에러가 발생해야 함', async () => {
      await request(app.getHttpServer())
        .post('/auth/signout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});
