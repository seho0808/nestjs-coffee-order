import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

export class OrderItemDto {
  @ApiProperty({
    description: '메뉴 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsString()
  menuId: string;

  @ApiProperty({
    description: '수량',
    example: 1,
  })
  @IsNumber()
  quantity: number;
}

export class CreateOrderDto {
  @ApiProperty({
    description: '주문 항목',
    type: [OrderItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}
