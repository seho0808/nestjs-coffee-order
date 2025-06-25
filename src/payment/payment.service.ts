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

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(PointTransaction)
    private readonly pointTransactionRepository: Repository<PointTransaction>,
  ) {}

  @Transactional()
  async chargePoints(
    userId: string,
    amount: number,
  ): Promise<PointTransaction> {
    if (!isValidUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    // 비관적 락으로 사용자 조회 - 동시성 제어
    const user = await this.userRepository.findOne({
      where: { id: userId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 포인트 업데이트
    user.point += amount;

    // 먼저 사용자 포인트를 업데이트하고 저장
    await this.userRepository.save(user);

    // 그 다음 트랜잭션 기록 생성 및 저장
    const pointTransaction = this.pointTransactionRepository.create({
      userId,
      amount,
      type: PointTransactionType.ADD,
    });

    await this.pointTransactionRepository.save(pointTransaction);

    return pointTransaction;
  }

  @Transactional()
  async deductPoints(
    userId: string,
    amount: number,
  ): Promise<PointTransaction> {
    // UUID 형식 검증
    if (!isValidUuid(userId)) {
      throw new NotFoundException('User not found');
    }

    // 비관적 락으로 사용자 조회 - 동시성 제어
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

    // 먼저 사용자 포인트를 업데이트하고 저장
    await this.userRepository.save(user);

    // 그 다음 트랜잭션 기록 생성 및 저장
    const pointTransaction = this.pointTransactionRepository.create({
      userId,
      amount,
      type: PointTransactionType.DEDUCT,
    });

    await this.pointTransactionRepository.save(pointTransaction);

    return pointTransaction;
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
}
