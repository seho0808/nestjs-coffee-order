import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../user/user.entity';
import {
  PointTransaction,
  PointTransactionType,
} from './point-transaction.entity';
import { isValidUuid } from 'src/common/utils/uuid';
import { Transactional } from 'typeorm-transactional';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PointTransaction)
    private readonly pointTransactionRepository: Repository<PointTransaction>,
  ) {}

  async chargePoints(
    userId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<PointTransaction> {
    if (!isValidUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    // idempotency key가 없으면 자동 생성
    const finalIdempotencyKey = idempotencyKey || uuidv4();

    const res = await this.executeChargeTransaction(
      userId,
      amount,
      finalIdempotencyKey,
    );

    if (res) return res;

    const existingTx = await this.findExistingTransaction(
      userId,
      finalIdempotencyKey,
      PointTransactionType.ADD,
    );

    if (!existingTx) {
      throw new Error('Failed to create transaction');
    }

    return existingTx;
  }

  async deductPoints(
    userId: string,
    amount: number,
    idempotencyKey?: string,
  ): Promise<PointTransaction> {
    // UUID 형식 검증
    if (!isValidUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    // idempotency key가 없으면 자동 생성
    const finalIdempotencyKey = idempotencyKey || uuidv4();

    const res = await this.executeDeductTransaction(
      userId,
      amount,
      finalIdempotencyKey,
    );

    if (res) return res;

    const existingTx = await this.findExistingTransaction(
      userId,
      finalIdempotencyKey,
      PointTransactionType.DEDUCT,
    );

    if (!existingTx) {
      throw new Error('Failed to create transaction');
    }

    return existingTx;
  }

  /**
   * 포인트 충전 트랜잭션 실행
   */
  @Transactional()
  private async executeChargeTransaction(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<PointTransaction | null> {
    // 트랜잭션 내에서 한 번 더 확인 (동시성 방지)
    const existingTransaction = await this.pointTransactionRepository.findOne({
      where: {
        userId,
        idempotencyKey,
        type: PointTransactionType.ADD,
      },
    });

    if (existingTransaction) {
      return existingTransaction;
    }

    // 비관적 락으로 사용자 조회
    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 포인트 업데이트
    user.point += amount;
    await this.userRepository.save(user);

    // 트랜잭션 기록 생성
    const pointTransaction = this.pointTransactionRepository.create({
      userId,
      amount,
      type: PointTransactionType.ADD,
      idempotencyKey,
    });

    try {
      return await this.pointTransactionRepository.save(pointTransaction);
    } catch (error) {
      // 유니크 제약 조건 위반 시 기존 트랜잭션 조회하여 반환
      if (error.code === '23505') {
        // 새로운 트랜잭션에서 기존 레코드 조회
        return null;
      }
      throw error;
    }
  }

  /**
   * 포인트 차감 트랜잭션 실행
   */
  @Transactional()
  private async executeDeductTransaction(
    userId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<PointTransaction> {
    // 트랜잭션 내에서 한 번 더 확인 (동시성 방지)
    const existingTransaction = await this.pointTransactionRepository.findOne({
      where: {
        userId,
        idempotencyKey,
        type: PointTransactionType.DEDUCT,
      },
    });

    if (existingTransaction) {
      return existingTransaction;
    }

    // 비관적 락으로 사용자 조회
    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 포인트 부족 확인
    if (user.point < amount) {
      throw new Error('Insufficient points');
    }

    // 포인트 차감
    user.point -= amount;
    await this.userRepository.save(user);

    // 트랜잭션 기록 생성
    const pointTransaction = this.pointTransactionRepository.create({
      userId,
      amount,
      type: PointTransactionType.DEDUCT,
      idempotencyKey,
    });

    try {
      return await this.pointTransactionRepository.save(pointTransaction);
    } catch (error) {
      // 유니크 제약 조건 위반 시 기존 트랜잭션 조회하여 반환
      if (error.code === '23505') {
        // 새로운 트랜잭션에서 기존 레코드 조회
        const existingTx = await this.findExistingTransaction(
          userId,
          idempotencyKey,
          PointTransactionType.DEDUCT,
        );
        if (existingTx) {
          return existingTx;
        }
      }
      throw error;
    }
  }

  /**
   * 사용자의 현재 포인트 조회 (동시성 안전)
   */
  async getUserPoints(userId: string): Promise<number> {
    if (!isValidUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['point'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.point;
  }

  /**
   * 사용자의 포인트 트랜잭션 히스토리 조회
   */
  async getPointTransactions(userId: string): Promise<PointTransaction[]> {
    if (!isValidUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    return this.pointTransactionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 기존 트랜잭션 조회
   */
  private async findExistingTransaction(
    userId: string,
    idempotencyKey: string,
    type: PointTransactionType,
  ): Promise<PointTransaction | null> {
    return this.pointTransactionRepository.findOne({
      where: { userId, idempotencyKey, type },
    });
  }
}
