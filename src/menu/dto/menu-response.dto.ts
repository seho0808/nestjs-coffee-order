import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, Min } from 'class-validator';
import { Menu } from '../menu.entity';

export class MenuResponseDto {
  @ApiProperty({
    description: '메뉴 UUID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @IsString()
  id: string;

  @ApiProperty({
    description: '메뉴 이름',
    example: '아메리카노',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: '메뉴 가격',
    example: 1000,
  })
  @IsNumber()
  @Min(0)
  price: number;

  constructor(menu: Menu) {
    this.id = menu.id;
    this.name = menu.name;
    this.price = menu.price;
  }
}
